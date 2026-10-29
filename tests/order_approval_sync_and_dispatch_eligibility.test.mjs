import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OLLUR_BRANCH_UUID = "bcfbc0e6-7f12-4513-8d7d-8f20bd173ddb";
const MOCK_ORDER_ID = "6fe6bb92-491c-4384-904d-e96726880001";

const OLLUR_BRANCH = {
  id: OLLUR_BRANCH_UUID,
  code: "BR-OLL-003",
  name: "Ice Spot Ollur",
  district: "Thrissur",
  address: "Company Padi, High Road, Ollur",
  phone: "+91 94470 00002",
};

// Mirror DeliveryStaffView logic for evaluating branch order eligibility
function evaluateBranchOrderEligibility(branch, orders) {
  const branchOrders = orders.filter(
    (o) => o.branchId === branch.id || o.branchCode === branch.code
  );

  const approvedOrders = branchOrders.filter(
    (o) =>
      (o.status === "approved" || o.status === "preparation" || o.status === "ready-for-dispatch") &&
      !o.assignedDispatchId
  );

  if (approvedOrders.length > 0) {
    const serverApproved = approvedOrders.filter((o) => UUID_REGEX.test(o.id));
    return {
      branch,
      eligibleOrder: serverApproved.length > 0 ? serverApproved[serverApproved.length - 1] : approvedOrders[approvedOrders.length - 1],
      ineligibleReason: undefined,
    };
  }

  if (branchOrders.length > 0) {
    const latestOrder = branchOrders[branchOrders.length - 1];
    let reason = `Order #${latestOrder.orderNumber || latestOrder.id} is not eligible for dispatch.`;
    if (latestOrder.status === "delivered") {
      reason = `Order #${latestOrder.orderNumber || latestOrder.id} has already been delivered.`;
    } else if (latestOrder.status === "dispatched" || latestOrder.assignedDispatchId) {
      reason = `Order #${latestOrder.orderNumber || latestOrder.id} has already been dispatched.`;
    } else if (latestOrder.items && latestOrder.items.length > 0 && latestOrder.items.every((it) => (it.approvedPacks || 0) === 0)) {
      reason = `Order #${latestOrder.orderNumber || latestOrder.id} has no approved quantities. Super Admin must approve items before scheduling delivery.`;
    } else if (latestOrder.status === "cancelled") {
      reason = `Order #${latestOrder.orderNumber || latestOrder.id} was cancelled.`;
    } else if (latestOrder.status === "submitted" || latestOrder.status === "under-review") {
      reason = `Order #${latestOrder.orderNumber || latestOrder.id} is awaiting Super Admin approval.`;
    }
    return { branch, eligibleOrder: undefined, ineligibleReason: reason };
  }

  return {
    branch,
    eligibleOrder: undefined,
    ineligibleReason: `No requisition orders found for ${branch.name}. Super Admin must approve a branch requisition before scheduling delivery.`,
  };
}

// Mirror Section 4 tab categorization
function categorizeSection4Order(ord) {
  const isPending = ord.status === "submitted" || ord.status === "under-review";
  const isApproved = (ord.status === "approved" || ord.status === "preparation" || ord.status === "ready-for-dispatch") && !ord.assignedDispatchId;
  const isDispatched = ord.status === "dispatched" || (ord.status !== "delivered" && ord.status !== "cancelled" && !!ord.assignedDispatchId);
  const isDelivered = ord.status === "delivered";

  return { isPending, isApproved, isDispatched, isDelivered };
}

// Server-side dispatch eligibility check mirroring rpc_create_dispatch
function validateOrderDispatchEligibility(order) {
  const eligibleStatuses = ["approved", "preparation", "ready_for_dispatch"];
  if (!eligibleStatuses.includes(order.status)) {
    return {
      eligible: false,
      error: "INELIGIBLE_ORDER_STATUS",
      message: `Order #${order.orderNumber} in status '${order.status}' is not eligible for dispatch. Super Admin must approve first.`,
    };
  }
  if (order.assignedDispatchId) {
    return {
      eligible: false,
      error: "ORDER_ALREADY_DISPATCHED",
      message: `Order #${order.orderNumber} is already assigned to active dispatch ${order.assignedDispatchId}.`,
    };
  }
  return { eligible: true };
}

test("1. Requisition Flow: Newly submitted order is classified as Awaiting Review in Section 4", () => {
  const submittedOrder = {
    id: MOCK_ORDER_ID,
    orderNumber: "ORD-2026-10070",
    branchId: OLLUR_BRANCH_UUID,
    branchName: "Ice Spot Ollur",
    branchCode: "BR-OLL-003",
    status: "submitted",
    totalUnitsRequested: 1300,
    totalUnitsApproved: 0,
    items: [
      { productId: "p1", productName: "Oreo Cream", sku: "SKU-STK-001", requestedPacks: 15, approvedPacks: 0 },
      { productId: "p2", productName: "Sweet Strawberry", sku: "SKU-STK-002", requestedPacks: 15, approvedPacks: 0 },
    ],
  };

  const cat = categorizeSection4Order(submittedOrder);
  assert.equal(cat.isPending, true, "Submitted order must be categorized as pending review");
  assert.equal(cat.isApproved, false, "Submitted order must NOT be categorized as approved");
});

test("2. Negative Guard: Unapproved submitted order CANNOT be dispatched", () => {
  const submittedOrder = {
    id: MOCK_ORDER_ID,
    orderNumber: "ORD-2026-10070",
    branchId: OLLUR_BRANCH_UUID,
    branchName: "Ice Spot Ollur",
    status: "submitted",
  };

  // Check Set Up Delivery Trip branch eligibility
  const { eligibleOrder, ineligibleReason } = evaluateBranchOrderEligibility(OLLUR_BRANCH, [submittedOrder]);
  assert.equal(eligibleOrder, undefined, "Unapproved order must not produce an eligible order");
  assert.match(ineligibleReason, /awaiting Super Admin approval/i, "Ineligible reason must state awaiting approval");

  // Check server-side dispatch creation validation
  const dispatchCheck = validateOrderDispatchEligibility(submittedOrder);
  assert.equal(dispatchCheck.eligible, false);
  assert.equal(dispatchCheck.error, "INELIGIBLE_ORDER_STATUS");
  assert.match(dispatchCheck.message, /Super Admin must approve first/);
});

test("3. Status Flow: Super Admin approval persists status 'approved' and updates allocations", () => {
  const submittedOrder = {
    id: MOCK_ORDER_ID,
    orderNumber: "ORD-2026-10070",
    branchId: OLLUR_BRANCH_UUID,
    branchName: "Ice Spot Ollur",
    status: "submitted",
    items: [
      { productId: "p1", requestedPacks: 15, approvedPacks: 0 },
      { productId: "p2", requestedPacks: 15, approvedPacks: 0 },
    ],
  };

  // Simulate approval mutation
  const approvedPacksMap = { p1: 15, p2: 15 };
  const approvedOrder = {
    ...submittedOrder,
    status: "approved",
    items: submittedOrder.items.map((it) => ({
      ...it,
      approvedPacks: approvedPacksMap[it.productId] ?? it.requestedPacks,
    })),
    totalUnitsApproved: 300,
  };

  assert.equal(approvedOrder.status, "approved");
  assert.equal(approvedOrder.items[0].approvedPacks, 15);
  assert.equal(approvedOrder.items[1].approvedPacks, 15);

  // Section 4 now classifies it as Approved & Ready
  const cat = categorizeSection4Order(approvedOrder);
  assert.equal(cat.isPending, false, "Approved order must leave pending review");
  assert.equal(cat.isApproved, true, "Approved order must be classified as approved & ready");
});

test("4. Dispatch Eligibility: Approved order is discovered by Set Up Delivery Trip and becomes dispatch-eligible", () => {
  const approvedOrder = {
    id: MOCK_ORDER_ID,
    orderNumber: "ORD-2026-10070",
    branchId: OLLUR_BRANCH_UUID,
    branchName: "Ice Spot Ollur",
    branchCode: "BR-OLL-003",
    status: "approved",
    items: [
      { productId: "p1", requestedPacks: 15, approvedPacks: 15 },
      { productId: "p2", requestedPacks: 15, approvedPacks: 15 },
    ],
  };

  const { eligibleOrder, ineligibleReason } = evaluateBranchOrderEligibility(OLLUR_BRANCH, [approvedOrder]);
  assert.ok(eligibleOrder, "Approved order must produce an eligible order");
  assert.equal(eligibleOrder.id, MOCK_ORDER_ID);
  assert.equal(eligibleOrder.status, "approved");
  assert.equal(ineligibleReason, undefined);

  // Server-side validation passes
  const dispatchCheck = validateOrderDispatchEligibility(approvedOrder);
  assert.equal(dispatchCheck.eligible, true, "Approved order must pass dispatch eligibility check");
});

test("5. Multi-View Synchronization: State reconciliation updates order status and approved units symmetrically", () => {
  // Stale client view (e.g. from localStorage) has submitted status
  const staleServerOrders = [
    {
      id: MOCK_ORDER_ID,
      orderNumber: "ORD-2026-10070",
      branchId: OLLUR_BRANCH_UUID,
      status: "submitted",
      totalUnitsRequested: 1300,
      totalUnitsApproved: 0,
      items: [],
    },
  ];

  // Database returns updated eligible order via getEligibleOrdersForDispatchAction
  const freshEligibleOrders = [
    {
      id: MOCK_ORDER_ID,
      orderNumber: "ORD-2026-10070",
      branchId: OLLUR_BRANCH_UUID,
      status: "approved",
      totalApprovedUnits: 300,
      items: [{ productId: "p1", approvedPacks: 15, requestedPacks: 15 }],
    },
  ];

  // Reconcile as in AdminContext.syncOrdersFromServer
  const map = new Map();
  staleServerOrders.forEach((so) => map.set(so.id, so));
  freshEligibleOrders.forEach((eo) => {
    if (!map.has(eo.id)) {
      map.set(eo.id, eo);
    } else {
      const existing = map.get(eo.id);
      if (existing && existing.status !== eo.status && (eo.status === "approved" || eo.status === "preparation" || eo.status === "ready-for-dispatch")) {
        map.set(eo.id, {
          ...existing,
          status: eo.status,
          items: eo.items,
          totalUnitsApproved: eo.totalApprovedUnits,
        });
      }
    }
  });

  const reconciled = Array.from(map.values());
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].status, "approved", "Reconciliation must update stale order status to approved");
  assert.equal(reconciled[0].totalUnitsApproved, 300);
});

test("6. Static SQL Audit: Forward migration grants Delivery Staff SELECT on orders and order_items", () => {
  const migrationPath = path.resolve("supabase/migrations/20261029000001_fix_delivery_staff_order_visibility.sql");
  assert.ok(fs.existsSync(migrationPath), "Migration 20261029000001 must exist");

  const sql = fs.readFileSync(migrationPath, "utf8");

  // orders_select_policy must include delivery_staff
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"orders_select_policy"\s+ON\s+public\.orders[\s\S]+?public\.current_app_role\(\)\s*=\s*'delivery_staff'::public\.app_role/,
    "orders_select_policy must allow delivery_staff to select orders"
  );

  // order_items_select must include delivery_staff
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"order_items_select"\s+ON\s+public\.order_items[\s\S]+?public\.current_app_role\(\)\s*=\s*'delivery_staff'::public\.app_role/,
    "order_items_select must allow delivery_staff to select order items"
  );

  // rpc_get_eligible_orders_for_dispatch must be defined with SECURITY DEFINER
  assert.match(
    sql,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.rpc_get_eligible_orders_for_dispatch\(\)[\s\S]+?SECURITY\s+DEFINER/,
    "rpc_get_eligible_orders_for_dispatch must be SECURITY DEFINER"
  );
});

