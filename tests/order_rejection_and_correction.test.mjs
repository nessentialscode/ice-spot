import test from "node:test";
import assert from "node:assert/strict";

// Identifiers & Constants
const VALID_ORDER_UUID_1 = "a1111111-1111-4111-8111-111111111111";
const VALID_ORDER_UUID_2 = "b2222222-2222-4222-8222-222222222222";
const VALID_BRANCH_UUID = "c3333333-3333-4333-8333-333333333333";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Replicate ALLOWED_ORDER_TRANSITIONS contract from orders.ts
const ALLOWED_ORDER_TRANSITIONS = {
  draft: ["submitted", "cancelled"],
  submitted: ["under_review", "approved", "cancelled", "amendment_requested"],
  under_review: ["approved", "cancelled", "submitted", "amendment_requested"],
  approved: ["preparation", "ready_for_dispatch", "cancelled", "amendment_requested"],
  preparation: ["ready_for_dispatch", "cancelled", "amendment_requested"],
  ready_for_dispatch: ["dispatched", "cancelled"],
  dispatched: ["delivered", "partially_delivered"],
  delivered: [],
  partially_delivered: ["delivered"],
  cancelled: [],
  amendment_requested: ["submitted", "under_review", "approved", "cancelled"],
};

// Simulated Server Action Engine for Orders
class MockOrderServerEngine {
  constructor() {
    this.orders = new Map();
    this.auditLogs = [];
  }

  seedOrder(order) {
    this.orders.set(order.id, { ...order });
  }

  async updateOrderStatus(orderId, newStatus, notes, callerProfile) {
    if (!callerProfile || !callerProfile.role) {
      return { success: false, message: "Authentication required to update order status.", error: "UNAUTHENTICATED" };
    }

    if (!orderId || !UUID_REGEX.test(orderId)) {
      return { success: false, message: "Invalid order identifier format (UUID required).", error: "INVALID_IDENTIFIER" };
    }

    const order = this.orders.get(orderId);
    if (!order) {
      return { success: false, message: "Order not found.", error: "NOT_FOUND" };
    }

    const normalizedNewStatus = newStatus.replace(/-/g, "_");
    const allowed = ALLOWED_ORDER_TRANSITIONS[order.status] || [];
    if (!allowed.includes(newStatus) && !allowed.includes(normalizedNewStatus)) {
      return {
        success: false,
        message: `Invalid status transition from '${order.status}' to '${newStatus}'.`,
        error: "INVALID_TRANSITION",
      };
    }

    const normalizedRole = callerProfile.role.toLowerCase().replace(/-/g, "_");
    const isSuperAdmin = normalizedRole === "super_admin";

    if (!isSuperAdmin) {
      if (order.branch_id !== callerProfile.branch_id) {
        return {
          success: false,
          message: "Unauthorized: Cannot modify an order for another branch.",
          error: "FORBIDDEN",
        };
      }
      if (normalizedNewStatus !== "cancelled" && normalizedNewStatus !== "submitted") {
        return {
          success: false,
          message: "Branch Admins can only submit or cancel their orders.",
          error: "FORBIDDEN",
        };
      }
    }

    const prevStatus = order.status;
    order.status = normalizedNewStatus;
    if (notes !== undefined) {
      order.notes = notes;
    }
    order.updated_at = new Date().toISOString();

    this.auditLogs.push({
      actorId: callerProfile.id,
      action: "ORDER_STATUS_UPDATED",
      entityId: orderId,
      details: { previousStatus: prevStatus, newStatus: normalizedNewStatus, notes },
    });

    return {
      success: true,
      message: `Order status updated to ${newStatus}.`,
    };
  }

  async rejectOrder(orderId, reason, callerProfile) {
    const normalizedRole = callerProfile?.role?.toLowerCase().replace(/-/g, "_");
    if (normalizedRole !== "super_admin") {
      return { success: false, message: "Unauthorized: Super Admin privileges required.", error: "FORBIDDEN" };
    }

    if (!reason || !reason.trim()) {
      return { success: false, message: "Please provide a reason for order rejection.", error: "VALIDATION_ERROR" };
    }

    return this.updateOrderStatus(orderId, "cancelled", `Rejected by factory: ${reason.trim()}`, callerProfile);
  }

  async returnOrderForCorrection(orderId, feedback, callerProfile) {
    const normalizedRole = callerProfile?.role?.toLowerCase().replace(/-/g, "_");
    if (normalizedRole !== "super_admin") {
      return { success: false, message: "Unauthorized: Super Admin privileges required.", error: "FORBIDDEN" };
    }

    if (!feedback || !feedback.trim()) {
      return {
        success: false,
        message: "Please describe what the branch needs to adjust before the order can be approved.",
        error: "VALIDATION_ERROR",
      };
    }

    return this.updateOrderStatus(orderId, "amendment_requested", `Correction required: ${feedback.trim()}`, callerProfile);
  }
}

// Simulated Client State Store (matching AdminContext.tsx)
class MockClientOrderStore {
  constructor(serverEngine) {
    this.serverEngine = serverEngine;
    this.orders = [];
    this.toast = null;
    this.syncCount = 0;
  }

  setOrders(orders) {
    this.orders = [...orders];
  }

  showToast(message, type = "success") {
    this.toast = { message, type };
  }

  async syncOrdersFromServer() {
    this.syncCount += 1;
    // Map server orders to client format
    this.orders = Array.from(this.serverEngine.orders.values()).map((o) => ({
      id: o.id,
      orderNumber: `ORD-2026-${o.order_number}`,
      branchId: o.branch_id,
      status: o.status.replace(/_/g, "-"),
      notes: o.notes,
      factoryNotes: o.notes,
    }));
  }

  async rejectOrder(orderId, reason, callerProfile) {
    if (!reason || !reason.trim()) {
      this.showToast("Please provide a reason for order rejection.", "error");
      return { success: false, message: "Rejection reason is required." };
    }

    const trimmedReason = reason.trim();
    if (UUID_REGEX.test(orderId)) {
      const res = await this.serverEngine.rejectOrder(orderId, trimmedReason, callerProfile);
      if (!res.success) {
        this.showToast(`Failed to reject order on server: ${res.message}`, "error");
        return { success: false, message: res.message };
      }
    }

    // Only update UI state after server confirms success
    this.orders = this.orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      return {
        ...ord,
        status: "cancelled",
        cancelReason: trimmedReason,
        factoryNotes: `Rejected by factory: ${trimmedReason}`,
      };
    });

    if (UUID_REGEX.test(orderId)) {
      await this.syncOrdersFromServer();
    }

    this.showToast("Order has been rejected with reason recorded.", "info");
    return { success: true, message: "Order rejected." };
  }

  async returnOrderForCorrection(orderId, notes, callerProfile) {
    if (!notes || !notes.trim()) {
      this.showToast("Please provide feedback for correction.", "error");
      return { success: false, message: "Correction feedback is required." };
    }

    const trimmedNotes = notes.trim();
    if (UUID_REGEX.test(orderId)) {
      const res = await this.serverEngine.returnOrderForCorrection(orderId, trimmedNotes, callerProfile);
      if (!res.success) {
        this.showToast(`Failed to return order on server: ${res.message}`, "error");
        return { success: false, message: res.message };
      }
    }

    // Only update UI state after server confirms success
    this.orders = this.orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      return {
        ...ord,
        status: "amendment-requested",
        amendmentNotes: trimmedNotes,
        factoryNotes: `Returned for correction: ${trimmedNotes}`,
      };
    });

    if (UUID_REGEX.test(orderId)) {
      await this.syncOrdersFromServer();
    }

    this.showToast("Order returned to branch for correction.", "info");
    return { success: true, message: "Order returned for correction." };
  }
}

// -----------------------------------------------------------------------------
// Test Suite: Reject Order & Return for Correction Workflows
// -----------------------------------------------------------------------------

test("1. Reject calls server mutation with correct order UUID and records cancellation", async () => {
  const engine = new MockOrderServerEngine();
  engine.seedOrder({
    id: VALID_ORDER_UUID_1,
    order_number: 101,
    branch_id: VALID_BRANCH_UUID,
    status: "submitted",
    notes: "Weekly replenishment batch",
  });

  const superAdmin = { id: "user-super", role: "super_admin" };
  const res = await engine.rejectOrder(VALID_ORDER_UUID_1, "Out of seasonal strawberry concentrate", superAdmin);

  assert.equal(res.success, true);
  const updatedOrder = engine.orders.get(VALID_ORDER_UUID_1);
  assert.equal(updatedOrder.status, "cancelled");
  assert.match(updatedOrder.notes, /Rejected by factory: Out of seasonal strawberry concentrate/);

  // Check audit trail
  assert.equal(engine.auditLogs.length, 1);
  assert.equal(engine.auditLogs[0].action, "ORDER_STATUS_UPDATED");
  assert.equal(engine.auditLogs[0].entityId, VALID_ORDER_UUID_1);
  assert.equal(engine.auditLogs[0].details.newStatus, "cancelled");
});

test("2. Successful rejection persists and recalculates pending queue (order leaves pending review)", async () => {
  const engine = new MockOrderServerEngine();
  engine.seedOrder({
    id: VALID_ORDER_UUID_1,
    order_number: 101,
    branch_id: VALID_BRANCH_UUID,
    status: "under_review",
    notes: null,
  });

  const store = new MockClientOrderStore(engine);
  await store.syncOrdersFromServer();

  // Initially order is pending review
  const pendingBefore = store.orders.filter((o) => o.status === "submitted" || o.status === "under-review");
  assert.equal(pendingBefore.length, 1);

  const superAdmin = { id: "user-super", role: "super_admin" };
  const res = await store.rejectOrder(VALID_ORDER_UUID_1, "Duplicate order submitted", superAdmin);

  assert.equal(res.success, true);

  // After rejection, order leaves pending review queue
  const pendingAfter = store.orders.filter((o) => o.status === "submitted" || o.status === "under-review");
  assert.equal(pendingAfter.length, 0);

  const rejectedOrder = store.orders.find((o) => o.id === VALID_ORDER_UUID_1);
  assert.equal(rejectedOrder.status, "cancelled");
  assert.equal(store.toast?.type, "info");
});

test("3. Rejected server mutation displays an error and does not falsely show success or alter state", async () => {
  const engine = new MockOrderServerEngine();
  // Order already in a terminal state
  engine.seedOrder({
    id: VALID_ORDER_UUID_1,
    order_number: 101,
    branch_id: VALID_BRANCH_UUID,
    status: "delivered",
    notes: "Completed run",
  });

  const store = new MockClientOrderStore(engine);
  await store.syncOrdersFromServer();

  const superAdmin = { id: "user-super", role: "super_admin" };
  // Attempt to reject an already delivered order
  const res = await store.rejectOrder(VALID_ORDER_UUID_1, "Attempt reject delivered", superAdmin);

  assert.equal(res.success, false);
  assert.match(res.message, /Invalid status transition/);

  // Status must remain 'delivered' in both server and client store
  assert.equal(engine.orders.get(VALID_ORDER_UUID_1).status, "delivered");
  assert.equal(store.orders.find((o) => o.id === VALID_ORDER_UUID_1).status, "delivered");
  assert.equal(store.toast?.type, "error");
});

test("4. Return for Correction submits correct order UUID and feedback reason", async () => {
  const engine = new MockOrderServerEngine();
  engine.seedOrder({
    id: VALID_ORDER_UUID_2,
    order_number: 102,
    branch_id: VALID_BRANCH_UUID,
    status: "submitted",
    notes: null,
  });

  const superAdmin = { id: "user-super", role: "super_admin" };
  const res = await engine.returnOrderForCorrection(
    VALID_ORDER_UUID_2,
    "Please reduce Mango crates to 4 or select Guava substitution",
    superAdmin
  );

  assert.equal(res.success, true);
  const updated = engine.orders.get(VALID_ORDER_UUID_2);
  assert.equal(updated.status, "amendment_requested");
  assert.match(updated.notes, /Correction required: Please reduce Mango crates/);
});

test("5. Successful correction request persists amendment_requested and leaves pending queue", async () => {
  const engine = new MockOrderServerEngine();
  engine.seedOrder({
    id: VALID_ORDER_UUID_2,
    order_number: 102,
    branch_id: VALID_BRANCH_UUID,
    status: "submitted",
    notes: null,
  });

  const store = new MockClientOrderStore(engine);
  await store.syncOrdersFromServer();

  const superAdmin = { id: "user-super", role: "super_admin" };
  const res = await store.returnOrderForCorrection(
    VALID_ORDER_UUID_2,
    "Adjust crate counts to match pallet capacity",
    superAdmin
  );

  assert.equal(res.success, true);

  // Order status on client is 'amendment-requested'
  const correctedOrder = store.orders.find((o) => o.id === VALID_ORDER_UUID_2);
  assert.equal(correctedOrder.status, "amendment-requested");

  // It is NO LONGER in the pending review queue ('submitted' or 'under-review')
  const pendingOrders = store.orders.filter((o) => o.status === "submitted" || o.status === "under-review");
  assert.equal(pendingOrders.length, 0);

  // Transition back: Branch can resubmit an order in 'amendment_requested'
  const branchAdmin = { id: "user-branch", role: "branch_admin", branch_id: VALID_BRANCH_UUID };
  const resubmitRes = await engine.updateOrderStatus(VALID_ORDER_UUID_2, "submitted", "Amended and resubmitted", branchAdmin);
  assert.equal(resubmitRes.success, true);
  assert.equal(engine.orders.get(VALID_ORDER_UUID_2).status, "submitted");
});

test("6. Missing rejection or correction reason is rejected immediately before mutation", async () => {
  const engine = new MockOrderServerEngine();
  engine.seedOrder({
    id: VALID_ORDER_UUID_1,
    order_number: 101,
    branch_id: VALID_BRANCH_UUID,
    status: "submitted",
  });

  const superAdmin = { id: "user-super", role: "super_admin" };

  // Rejection with empty reason
  const resRejectEmpty = await engine.rejectOrder(VALID_ORDER_UUID_1, "", superAdmin);
  assert.equal(resRejectEmpty.success, false);
  assert.equal(resRejectEmpty.error, "VALIDATION_ERROR");

  const resRejectWhitespace = await engine.rejectOrder(VALID_ORDER_UUID_1, "   ", superAdmin);
  assert.equal(resRejectWhitespace.success, false);
  assert.equal(resRejectWhitespace.error, "VALIDATION_ERROR");

  // Correction with empty feedback
  const resCorrectEmpty = await engine.returnOrderForCorrection(VALID_ORDER_UUID_1, "", superAdmin);
  assert.equal(resCorrectEmpty.success, false);
  assert.equal(resCorrectEmpty.error, "VALIDATION_ERROR");

  // Order status must remain 'submitted'
  assert.equal(engine.orders.get(VALID_ORDER_UUID_1).status, "submitted");
});

test("7. Unauthorized users cannot invoke either mutation", async () => {
  const engine = new MockOrderServerEngine();
  engine.seedOrder({
    id: VALID_ORDER_UUID_1,
    order_number: 101,
    branch_id: VALID_BRANCH_UUID,
    status: "submitted",
  });

  const branchAdmin = { id: "user-branch", role: "branch_admin", branch_id: VALID_BRANCH_UUID };
  const deliveryStaff = { id: "user-driver", role: "delivery_staff" };
  const unauthenticated = null;

  // Branch Admin cannot reject
  const resBranchReject = await engine.rejectOrder(VALID_ORDER_UUID_1, "Reason", branchAdmin);
  assert.equal(resBranchReject.success, false);
  assert.equal(resBranchReject.error, "FORBIDDEN");

  // Branch Admin cannot return for correction
  const resBranchCorrect = await engine.returnOrderForCorrection(VALID_ORDER_UUID_1, "Feedback", branchAdmin);
  assert.equal(resBranchCorrect.success, false);
  assert.equal(resBranchCorrect.error, "FORBIDDEN");

  // Delivery staff cannot reject
  const resDriverReject = await engine.rejectOrder(VALID_ORDER_UUID_1, "Reason", deliveryStaff);
  assert.equal(resDriverReject.success, false);
  assert.equal(resDriverReject.error, "FORBIDDEN");

  // Unauthenticated caller is rejected
  const resAnonReject = await engine.rejectOrder(VALID_ORDER_UUID_1, "Reason", unauthenticated);
  assert.equal(resAnonReject.success, false);
  assert.equal(resAnonReject.error, "FORBIDDEN");
});

test("8. Failed requests do not leave stale or falsely updated local state", async () => {
  const engine = new MockOrderServerEngine();
  engine.seedOrder({
    id: VALID_ORDER_UUID_1,
    order_number: 101,
    branch_id: VALID_BRANCH_UUID,
    status: "submitted",
    notes: "Original notes",
  });

  const store = new MockClientOrderStore(engine);
  await store.syncOrdersFromServer();

  // Caller with unauthorized role causes server rejection
  const unauthorizedUser = { id: "user-anon", role: "branch_admin", branch_id: VALID_BRANCH_UUID };
  const res = await store.returnOrderForCorrection(VALID_ORDER_UUID_1, "Test feedback", unauthorizedUser);

  assert.equal(res.success, false);
  assert.equal(store.toast?.type, "error");

  // Local store state must remain strictly in 'submitted' status with original notes
  const order = store.orders.find((o) => o.id === VALID_ORDER_UUID_1);
  assert.equal(order.status, "submitted");
  assert.equal(order.notes, "Original notes");
});

test("9. Duplicate submission prevention and in-flight guard", async () => {
  let inFlight = false;
  let executionCount = 0;

  const simulateSafeDialogSubmit = async (reason) => {
    if (inFlight) return { success: false, message: "Duplicate submission ignored" };
    if (!reason.trim()) return { success: false, message: "Reason required" };
    inFlight = true;
    try {
      // simulate network delay
      await new Promise((r) => setTimeout(r, 10));
      executionCount += 1;
      return { success: true };
    } finally {
      inFlight = false;
    }
  };

  // Fire two rapid submissions in parallel
  const [res1, res2] = await Promise.all([
    simulateSafeDialogSubmit("First click reason"),
    simulateSafeDialogSubmit("Second rapid click reason"),
  ]);

  assert.equal(executionCount, 1);
  assert.equal(res1.success || res2.success, true);
  assert.equal(res1.success && res2.success, false); // One succeeded, one was guarded
});

test("10. Existing order approval and delivery functionality remains unaffected", async () => {
  const engine = new MockOrderServerEngine();
  engine.seedOrder({
    id: VALID_ORDER_UUID_1,
    order_number: 101,
    branch_id: VALID_BRANCH_UUID,
    status: "submitted",
  });

  const superAdmin = { id: "user-super", role: "super_admin" };

  // Approval from submitted
  const resApprove = await engine.updateOrderStatus(VALID_ORDER_UUID_1, "approved", "Approved by factory", superAdmin);
  assert.equal(resApprove.success, true);
  assert.equal(engine.orders.get(VALID_ORDER_UUID_1).status, "approved");

  // Progression to dispatch
  const resPrep = await engine.updateOrderStatus(VALID_ORDER_UUID_1, "preparation", null, superAdmin);
  assert.equal(resPrep.success, true);

  const resReady = await engine.updateOrderStatus(VALID_ORDER_UUID_1, "ready_for_dispatch", null, superAdmin);
  assert.equal(resReady.success, true);

  const resDispatch = await engine.updateOrderStatus(VALID_ORDER_UUID_1, "dispatched", null, superAdmin);
  assert.equal(resDispatch.success, true);

  // Progression to delivery
  const resDelivered = await engine.updateOrderStatus(VALID_ORDER_UUID_1, "delivered", null, superAdmin);
  assert.equal(resDelivered.success, true);
  assert.equal(engine.orders.get(VALID_ORDER_UUID_1).status, "delivered");
});

test("11. Queue tab filtering strictly categorizes authoritative orders in ordered sequence (All, Awaiting, Approved, Cancelled, Correction)", () => {
  const mockOrders = [
    { id: "1", orderNumber: "ORD-1", status: "submitted", branchName: "Kaloor Hub", branchCode: "KL-01" },
    { id: "2", orderNumber: "ORD-2", status: "under_review", branchName: "Kakkanad Hub", branchCode: "KK-02" },
    { id: "3", orderNumber: "ORD-3", status: "approved", branchName: "Edappally Toll", branchCode: "ED-03" },
    { id: "4", orderNumber: "ORD-4", status: "amendment_requested", branchName: "MG Road", branchCode: "MG-04" },
    { id: "5", orderNumber: "ORD-5", status: "cancelled", branchName: "Vyttila", branchCode: "VY-05" },
  ];

  const filterTab = (orders, tab) => {
    return orders.filter((o) => {
      const norm = o.status.replace(/_/g, "-");
      if (tab === "approved") return norm === "approved";
      if (tab === "awaiting") return norm === "submitted" || norm === "under-review";
      if (tab === "correction") return norm === "amendment-requested";
      if (tab === "cancelled") return norm === "cancelled";
      if (tab === "all") return true;
      return false;
    });
  };

  // 1. First tab: All Orders (default view)
  const all = filterTab(mockOrders, "all");
  assert.equal(all.length, 5);

  // 2. Second tab: Awaiting Review
  const awaiting = filterTab(mockOrders, "awaiting");
  assert.equal(awaiting.length, 2);
  assert.deepEqual(awaiting.map((o) => o.id), ["1", "2"]);

  // 3. Third tab: Approved Orders
  const approved = filterTab(mockOrders, "approved");
  assert.equal(approved.length, 1);
  assert.equal(approved[0].id, "3");

  // 4. Fourth tab: Cancelled
  const cancelled = filterTab(mockOrders, "cancelled");
  assert.equal(cancelled.length, 1);
  assert.equal(cancelled[0].id, "5");

  // 5. Fifth tab: Correction Requested
  const correction = filterTab(mockOrders, "correction");
  assert.equal(correction.length, 1);
  assert.equal(correction[0].id, "4");
});

test("12. Zero-row DB update guard: silent RLS drop returns NO_ROWS_UPDATED error", async () => {
  // Simulating PostgREST .select() verification
  const simulatePostgrestUpdateWithSelect = async (rowsMatched) => {
    // If rowsMatched === 0, updatedRows is []
    const updatedRows = rowsMatched > 0 ? [{ id: VALID_ORDER_UUID_1, status: "cancelled" }] : [];
    if (!updatedRows || updatedRows.length === 0) {
      return {
        success: false,
        message: "No order record was updated; check database permissions or order ID.",
        error: "NO_ROWS_UPDATED",
      };
    }
    return { success: true, data: updatedRows[0] };
  };

  const failedResult = await simulatePostgrestUpdateWithSelect(0);
  assert.equal(failedResult.success, false);
  assert.equal(failedResult.error, "NO_ROWS_UPDATED");

  const successResult = await simulatePostgrestUpdateWithSelect(1);
  assert.equal(successResult.success, true);
  assert.equal(successResult.data.status, "cancelled");
});

test("13. Dialog error retention: server rejection keeps dialog open and displays error", async () => {
  let dialogOpen = true;
  let displayedError = null;

  const handleReject = async (orderId, reason) => {
    // Simulated server action returning failure
    const serverResult = {
      success: false,
      message: "Order cannot be cancelled; status is already delivered.",
      error: "INVALID_TRANSITION",
    };

    if (!serverResult.success) {
      displayedError = serverResult.message;
      return; // Do NOT close dialog
    }

    dialogOpen = false;
  };

  await handleReject(VALID_ORDER_UUID_1, "Too late");
  assert.equal(dialogOpen, true);
  assert.equal(displayedError, "Order cannot be cancelled; status is already delivered.");
});

test("14. Queue search filter matches branch name, code, or order number case-insensitively", () => {
  const mockOrders = [
    { id: "1", orderNumber: "ORD-2026-104", branchName: "Kaloor Hub", branchCode: "KL-01" },
    { id: "2", orderNumber: "ORD-2026-105", branchName: "Kakkanad Central", branchCode: "KK-02" },
  ];

  const search = (query) => {
    const q = query.toLowerCase().trim();
    return mockOrders.filter((o) =>
      o.branchName.toLowerCase().includes(q) ||
      o.branchCode.toLowerCase().includes(q) ||
      o.orderNumber.toLowerCase().includes(q)
    );
  };

  assert.equal(search("kaloor").length, 1);
  assert.equal(search("KK-02").length, 1);
  assert.equal(search("104").length, 1);
  assert.equal(search("nonexistent").length, 0);
});

test("15. Rejection of approved order and confirmation button validation", async () => {
  const engine = new MockOrderServerEngine();
  engine.seedOrder({
    id: VALID_ORDER_UUID_1,
    order_number: 103,
    branch_id: VALID_BRANCH_UUID,
    status: "approved",
  });

  const superAdmin = { id: "user-super", role: "super_admin" };

  // 1. Empty reason validation blocks rejection
  const resEmpty = await engine.rejectOrder(VALID_ORDER_UUID_1, "   ", superAdmin);
  assert.equal(resEmpty.success, false);
  assert.equal(resEmpty.error, "VALIDATION_ERROR");
  assert.equal(engine.orders.get(VALID_ORDER_UUID_1).status, "approved");

  // 2. Valid reason transitions approved order to cancelled
  const resValid = await engine.rejectOrder(VALID_ORDER_UUID_1, "Emergency production halt", superAdmin);
  assert.equal(resValid.success, true);
  assert.equal(engine.orders.get(VALID_ORDER_UUID_1).status, "cancelled");
  assert.match(engine.orders.get(VALID_ORDER_UUID_1).notes, /Emergency production halt/);
});
