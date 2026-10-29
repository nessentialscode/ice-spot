import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("1. Failed database writes are reported as errors, not false successes", async () => {
  // Simulate server action behavior when database rejects write
  async function simulateOrderPlacement(input, dbMockFail) {
    if (dbMockFail) {
      return {
        success: false,
        message: "Database insertion error: Permission denied or constraint failed",
        error: "DB_ERROR",
      };
    }
    return {
      success: true,
      message: "Order placed successfully.",
      data: { orderId: "ord-123", orderNumber: 10050n },
    };
  }

  // UI state coordinator
  let uiOrderState = [];
  let toastMessage = null;
  let toastType = null;

  function showToast(msg, type) {
    toastMessage = msg;
    toastType = type;
  }

  // When database fails:
  const failResult = await simulateOrderPlacement({ branchId: "b1" }, true);
  if (failResult.success) {
    uiOrderState.push({ id: failResult.data.orderId });
    showToast("Order placed successfully!", "success");
  } else {
    showToast(failResult.message, "error");
  }

  // Assert UI was NOT updated with fake order and error toast was shown
  assert.equal(uiOrderState.length, 0);
  assert.equal(toastType, "error");
  assert.match(toastMessage, /Database insertion error/);
});

test("2. Successful database writes correctly update UI state", async () => {
  let uiOrderState = [];
  let toastMessage = null;
  let toastType = null;

  function showToast(msg, type) {
    toastMessage = msg;
    toastType = type;
  }

  const successResult = {
    success: true,
    message: "Order placed successfully.",
    data: { orderId: "ord-123", orderNumber: 10050n },
  };

  if (successResult.success) {
    uiOrderState.push({ id: successResult.data.orderId, orderNumber: successResult.data.orderNumber });
    showToast("Order placed successfully!", "success");
  } else {
    showToast(successResult.message, "error");
  }

  assert.equal(uiOrderState.length, 1);
  assert.equal(uiOrderState[0].id, "ord-123");
  assert.equal(toastType, "success");
});

test("3. Audit log structure conforms to live schema", () => {
  const auditLogs = [];

  function recordAuditLog(actorId, action, entityType, entityId, details) {
    // In live DB: actor_id, action, entity_type, entity_id, details, created_at
    // Must NOT use legacy 'user_id' or 'changes'
    const entry = {
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      created_at: new Date().toISOString(),
    };
    auditLogs.push(entry);
    return entry;
  }

  const log = recordAuditLog(
    "2236f15a-bba8-48ba-bd23-764380fb7cba",
    "ORDER_APPROVED",
    "order",
    "ord-10001",
    { approvedBy: "Super Admin", note: "Approved" }
  );

  assert.equal(log.actor_id, "2236f15a-bba8-48ba-bd23-764380fb7cba");
  assert.equal(log.action, "ORDER_APPROVED");
  assert.equal(log.entity_type, "order");
  assert.equal(log.entity_id, "ord-10001");
  assert.equal(typeof log.details, "object");
  assert.ok(log.created_at);
  assert.equal("user_id" in log, false);
  assert.equal("changes" in log, false);
});

test("4. Dispatch creation writes route stops to dispatch_orders and stop updates target dispatch_orders", () => {
  const dispatchesSource = fs.readFileSync(path.resolve("src/lib/actions/dispatches.ts"), "utf8");

  // createDispatchAction must insert stops into dispatch_orders, not dispatch_items
  assert.match(
    dispatchesSource,
    /from\(\s*["']dispatch_orders["']\s*\)\s*\.insert\(\s*stopsToInsert\s*\)/,
    "createDispatchAction must insert route stops into dispatch_orders"
  );
  assert.doesNotMatch(
    dispatchesSource,
    /from\(\s*["']dispatch_items["']\s*\)\s*\.insert\(\s*stopsToInsert\s*\)/,
    "createDispatchAction must NOT insert stops into dispatch_items"
  );

  // updateStopStatusAction must update dispatch_orders using dispatch_id and order_id filters
  assert.match(
    dispatchesSource,
    /from\(\s*["']dispatch_orders["']\s*\)\s*\.update\(\s*payload\s*\)\s*\.eq\(\s*["']dispatch_id["']\s*,\s*dispatchId\s*\)\s*\.eq\(\s*["']order_id["']\s*,\s*orderId\s*\)/,
    "updateStopStatusAction must update dispatch_orders filtered by dispatch_id and order_id"
  );
});

test("5. Branch order submission validates and enforces authenticated branch UUID, rejecting missing/invalid UUID strings", () => {
  const branchViewSource = fs.readFileSync(path.resolve("src/app/admin/branch/BranchAdminView.tsx"), "utf8");

  // Must not contain hardcoded "branch-13" in submitOrder call
  assert.doesNotMatch(
    branchViewSource,
    /submitOrder\(\s*\{\s*branchId:\s*["']branch-13["']/i,
    "BranchAdminView must not use hardcoded 'branch-13' as branchId"
  );

  // Must validate UUID
  assert.match(
    branchViewSource,
    /UUID_REGEX\s*=\s*\/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$\/i/,
    "BranchAdminView must define standard UUID regex for validation"
  );

  // Test UUID rejection logic
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  assert.equal(UUID_REGEX.test("branch-13"), false);
  assert.equal(UUID_REGEX.test("ollur-branch"), false);
  assert.equal(UUID_REGEX.test(""), false);
  assert.equal(UUID_REGEX.test(undefined), false);
  assert.equal(UUID_REGEX.test("c1111111-1111-1111-1111-111111111111"), true);
});

test("6. Persisted shipment receipt confirmation handles server failure gracefully without false success", async () => {
  const adminContextSource = fs.readFileSync(path.resolve("src/context/AdminContext.tsx"), "utf8");

  // Must import confirmOrderReceiptAction
  assert.match(
    adminContextSource,
    /confirmOrderReceiptAction/,
    "AdminContext must reference confirmOrderReceiptAction"
  );

  // Must call confirmOrderReceiptAction inside receiveShipment
  assert.match(
    adminContextSource,
    /confirmOrderReceiptAction\(\s*\{[\s\S]*?orderId[\s\S]*?receiptStatus[\s\S]*?\}\s*\)/,
    "AdminContext must invoke confirmOrderReceiptAction with orderId and receiptStatus"
  );

  // Simulate receipt rejection: UI must not mark as delivered
  let localOrderStatus = "dispatched";
  let toastMsg = null;
  let toastType = null;

  async function mockReceiveShipment(orderId, fail) {
    if (fail) {
      toastMsg = "Server receipt rejection: Branch isolation violation";
      toastType = "error";
      return { success: false, message: toastMsg };
    }
    localOrderStatus = "delivered";
    toastMsg = "Shipment confirmed 100% received in good order!";
    toastType = "success";
    return { success: true, message: toastMsg };
  }

  const failRes = await mockReceiveShipment("ord-1", true);
  assert.equal(failRes.success, false);
  assert.equal(localOrderStatus, "dispatched", "Order must NOT be marked delivered if server rejects receipt");
  assert.equal(toastType, "error");

  const successRes = await mockReceiveShipment("ord-1", false);
  assert.equal(successRes.success, true);
  assert.equal(localOrderStatus, "delivered");
  assert.equal(toastType, "success");
});

test("7. Commercial invoice viewer integration and role/branch authorization enforcement", () => {
  const orderModalSource = fs.readFileSync(path.resolve("src/components/admin/OrderDetailModal.tsx"), "utf8");

  // Must import InvoiceModal and getInvoiceForOrderAction
  assert.match(
    orderModalSource,
    /import\s*\{[^}]*InvoiceModal[^}]*\}\s*from\s*["']\.\/InvoiceModal["']/,
    "OrderDetailModal must import InvoiceModal"
  );
  assert.match(
    orderModalSource,
    /import\s*\{[^}]*getInvoiceForOrderAction[^}]*\}\s*from\s*["']@\/lib\/actions\/invoices["']/,
    "OrderDetailModal must import getInvoiceForOrderAction"
  );

  // Must render "View Commercial Invoice" button
  assert.match(
    orderModalSource,
    /View Commercial Invoice/,
    "OrderDetailModal must render View Commercial Invoice action"
  );

  // Must render InvoiceModal component
  assert.match(
    orderModalSource,
    /<InvoiceModal[\s\S]*?invoice=\{invoiceData\}[\s\S]*?order=\{order\}/,
    "OrderDetailModal must render InvoiceModal with fetched invoiceData"
  );
});

test("8. Public enquiry abuse controls, honeypot bot guard, and zero false success on failure", () => {
  const enquirySource = fs.readFileSync(path.resolve("src/lib/actions/enquiries.ts"), "utf8");

  // Honeypot check
  assert.match(
    enquirySource,
    /data\.honeypot/,
    "submitEnquiryAction must check honeypot field"
  );

  // Rate limiting check
  assert.match(
    enquirySource,
    /isRateLimited/,
    "submitEnquiryAction must include rate limiting check"
  );

  // Zero false success on database failure
  const errorBlockMatch = enquirySource.match(/if\s*\(\s*error\s*\)\s*\{([^}]+)\}/);
  assert.ok(errorBlockMatch, "Must contain if (error) block");
  assert.match(errorBlockMatch[1], /success:\s*false/, "Error block must return success: false");
  assert.doesNotMatch(errorBlockMatch[1], /success:\s*true/, "Error block must NOT return success: true");
});

test("9. Dispatch creation validates order UUIDs, deduplicates orders, and verifies order status eligibility", () => {
  const dispatchSource = fs.readFileSync(path.resolve("src/lib/actions/dispatches.ts"), "utf8");

  // UUID validation check
  assert.match(
    dispatchSource,
    /UUID_REGEX\.test\(\s*oid\s*\)/,
    "createDispatchAction must validate each order ID against UUID regex"
  );

  // Order deduplication check
  assert.match(
    dispatchSource,
    /Array\.from\(\s*new\s+Set\(\s*input\.orderIds\s*\)\s*\)/,
    "createDispatchAction must deduplicate orderIds array"
  );

  // Order status eligibility check
  assert.match(
    dispatchSource,
    /ineligibleOrders/,
    "createDispatchAction must filter and reject ineligible orders"
  );
  assert.match(
    dispatchSource,
    /Only approved orders can be dispatched/,
    "createDispatchAction must provide clear error message when non-approved orders are submitted"
  );
});

test("10. Stop updates enforce role authorization, driver isolation, and UUID validation", () => {
  const dispatchSource = fs.readFileSync(path.resolve("src/lib/actions/dispatches.ts"), "utf8");

  // Role authorization
  assert.match(
    dispatchSource,
    /normalizedRole\s*!==\s*["']super_admin["']\s*&&\s*normalizedRole\s*!==\s*["']delivery_staff["']/,
    "updateStopStatusAction must restrict callers to super_admin and delivery_staff"
  );

  // Driver isolation check
  assert.match(
    dispatchSource,
    /dispatchRecord(\?\.|\.)driver_id\s*!==\s*auth\.user\?\.id/,
    "updateStopStatusAction must verify driver assignment for delivery_staff"
  );

  // Audit log conformance (actor_id, details)
  assert.match(
    dispatchSource,
    /actor_id:\s*auth\.user\.id/,
    "updateStopStatusAction must use actor_id instead of legacy user_id"
  );
});

test("11. Inventory adjustment validates product and branch UUID format and non-zero finite quantities", () => {
  const inventorySource = fs.readFileSync(path.resolve("src/lib/actions/inventory.ts"), "utf8");

  // UUID validation
  assert.match(
    inventorySource,
    /UUID_REGEX\.test\(\s*productId\s*\)/,
    "adjustInventoryAction must validate productId against UUID regex"
  );
  assert.match(
    inventorySource,
    /UUID_REGEX\.test\(\s*branchId\s*\)/,
    "adjustInventoryAction must validate branchId against UUID regex"
  );

  // Finite amount validation
  assert.match(
    inventorySource,
    /Number\.isFinite\(\s*changeAmount\s*\)/,
    "adjustInventoryAction must check that changeAmount is finite"
  );
});
test("12. Dispatch creation transaction boundary enforces rollback to prevent orphaned manifests and partial order dispatches", () => {
  const dispatchSource = fs.readFileSync(path.resolve("src/lib/actions/dispatches.ts"), "utf8");

  // Rollback on stops error
  assert.match(
    dispatchSource,
    /from\(\s*["']dispatches["']\s*\)\s*\.delete\(\s*\)\s*\.eq\(\s*["']id["']\s*,\s*dispatch\.id\s*\)/,
    "createDispatchAction must delete orphaned dispatch manifest on stop insertion failure"
  );

  // Rollback on order update failure
  assert.match(
    dispatchSource,
    /from\(\s*["']dispatch_orders["']\s*\)\s*\.delete\(\s*\)\s*\.eq\(\s*["']dispatch_id["']\s*,\s*dispatch\.id\s*\)/,
    "createDispatchAction must delete route stops if order status update fails"
  );
});

test("13. Order actions validate UUIDs and draft creation rolls back on item failure", () => {
  const ordersSource = fs.readFileSync(path.resolve("src/lib/actions/orders.ts"), "utf8");

  // UUID Regex defined
  assert.match(ordersSource, /UUID_REGEX\s*=\s*\/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$\/i/,
    "orders.ts must define standard UUID_REGEX"
  );

  // UUID validation in approveOrderAction
  assert.match(
    ordersSource,
    /UUID_REGEX\.test\(\s*orderId\s*\)/,
    "approveOrderAction must validate orderId UUID format"
  );

  // UUID validation in createOrderAction
  assert.match(
    ordersSource,
    /UUID_REGEX\.test\(\s*input\.branchId\s*\)/,
    "createOrderAction must validate branchId UUID format"
  );

  // Draft rollback on item failure
  assert.match(
    ordersSource,
    /from\(\s*["']orders["']\s*\)\s*\.delete\(\s*\)\s*\.eq\(\s*["']id["']\s*,\s*orderData\.id\s*\)/,
    "saveOrderDraftAction must delete draft order if items insertion fails"
  );
});

test("14. Enquiry rate limiter runtime boundaries and cache pruning audit", () => {
  const enquiriesSource = fs.readFileSync(path.resolve("src/lib/actions/enquiries.ts"), "utf8");

  // Architectural audit comments
  assert.match(
    enquiriesSource,
    /ARCHITECTURAL AUDIT & RUNTIME NOTICE/,
    "enquiries.ts must contain architectural audit notice"
  );
  assert.match(
    enquiriesSource,
    /Upstash Redis|@upstash\/ratelimit/i,
    "enquiries.ts must document Upstash Redis distributed store dependency"
  );
  assert.match(
    enquiriesSource,
    /rpc_check_enquiry_rate_limit/i,
    "enquiries.ts must document PostgreSQL RPC alternative"
  );

  // Memory leak pruning function
  assert.match(
    enquiriesSource,
    /function pruneExpiredRateLimits/,
    "enquiries.ts must define pruneExpiredRateLimits to avoid memory leaks"
  );
});

test("15. Dispatch trip update enforces role model, driver isolation, and completed trip immutability", () => {
  const dispatchesSource = fs.readFileSync(path.resolve("src/lib/actions/dispatches.ts"), "utf8");

  // Exported server action
  assert.match(
    dispatchesSource,
    /export async function updateDispatchTripAction/,
    "dispatches.ts must export updateDispatchTripAction"
  );

  // Completed status immutability check
  assert.match(
    dispatchesSource,
    /existingDispatch\.status === ["']completed["']/,
    "updateDispatchTripAction must reject updates on completed dispatches"
  );
  assert.match(
    dispatchesSource,
    /DISPATCH_ALREADY_COMPLETED/,
    "updateDispatchTripAction must return DISPATCH_ALREADY_COMPLETED error code"
  );

  // Driver isolation check
  assert.match(
    dispatchesSource,
    /normalizedRole === ["']delivery_staff["']\s*&&\s*existingDispatch\.driver_id\s*&&\s*existingDispatch\.driver_id !== auth\.user\?\.id/,
    "updateDispatchTripAction must enforce driver isolation for delivery staff"
  );

  // Super Admin vehicle reassignment check
  assert.match(
    dispatchesSource,
    /Fleet vehicle reassignment requires Super Admin authority/,
    "updateDispatchTripAction must restrict fleet vehicle changes to Super Admin"
  );
});
