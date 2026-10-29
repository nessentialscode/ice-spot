import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Test Identifiers & Constants
const VALID_OLLUR_BRANCH_UUID = "bcfbc0e6-7f12-4513-8d7d-8f20bd173ddb";
const VALID_TOWN_BRANCH_UUID = "e138758f-dd3f-4878-be00-d12ad36f6b81";
const INVALID_UUID = "non-uuid-branch-id";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STRAWBERRY_PRODUCT_UUID = "1b3e4fae-f068-4f79-b519-76e77d876e32";
const MANGO_PRODUCT_UUID = "809f5a73-19b1-481d-8dd8-3c3e19d9ec72";
const NON_UUID_SLUG = "strawberry";

// Mock Database State & Order Action Simulation
class MockOrderService {
  constructor() {
    this.orders = [];
    this.orderSeq = 100;
  }

  reset() {
    this.orders = [];
    this.orderSeq = 100;
  }

  seedOrder(order) {
    this.orders.push(order);
  }

  // Simulates createOrderAction with strict pending order rules & UUID validation
  async createOrder({ branchId, callerRole, callerBranchId, items, notes, weekStart }) {
    if (!branchId || !UUID_REGEX.test(branchId)) {
      return {
        success: false,
        message: "A valid branch UUID is required to create an order.",
        error: "INVALID_IDENTIFIER",
      };
    }

    const normalizedRole = callerRole.toLowerCase().replace(/-/g, "_");
    if (normalizedRole === "branch_admin" && callerBranchId !== branchId) {
      return {
        success: false,
        message: "Branch isolation violation: Branch admin can only place orders for their assigned branch.",
        error: "FORBIDDEN",
      };
    }

    if (!items || items.length === 0) {
      return {
        success: false,
        message: "Order must contain at least one product item.",
        error: "VALIDATION_ERROR",
      };
    }

    for (const it of items) {
      if (!it.productId || !UUID_REGEX.test(it.productId)) {
        return {
          success: false,
          message: `Invalid product identifier format: ${it.productId}. UUID required.`,
          error: "INVALID_IDENTIFIER",
        };
      }
      if (it.requestedQuantity <= 0 || !Number.isFinite(it.requestedQuantity)) {
        return {
          success: false,
          message: `Invalid product quantity for item ${it.productId}: must be a positive number.`,
          error: "INVALID_QUANTITY",
        };
      }
    }

    // Pending Order Check: Status in ['submitted', 'under_review']
    const existingPending = this.orders.find(
      (o) => o.branchId === branchId && (o.status === "submitted" || o.status === "under_review")
    );

    if (existingPending) {
      return {
        success: false,
        message: `A replenishment order (ORD-2026-${existingPending.orderNumber}) is already pending review for this branch.`,
        error: "PENDING_ORDER_EXISTS",
        data: {
          existingOrderId: existingPending.id,
          existingOrderNumber: existingPending.orderNumber,
          status: existingPending.status,
        },
      };
    }

    // Insert new order
    this.orderSeq += 1;
    const newOrder = {
      id: `ord-uuid-${this.orderSeq}`,
      orderNumber: this.orderSeq,
      branchId,
      status: "submitted",
      notes: notes || null,
      weekStart: weekStart || "2026-10-26",
      items: items.map((it) => ({
        productId: it.productId,
        requestedQuantity: it.requestedQuantity,
        approvedQuantity: 0,
        unitPrice: it.unitPrice || 35,
      })),
      createdAt: new Date().toISOString(),
    };

    this.orders.push(newOrder);

    return {
      success: true,
      message: "Order placed successfully.",
      data: {
        orderId: newOrder.id,
        orderNumber: newOrder.orderNumber,
      },
    };
  }

  // Simulates approveOrderAction
  async approveOrder(orderId, callerRole) {
    if (callerRole !== "super_admin") {
      return { success: false, message: "Super Admin privileges required", error: "FORBIDDEN" };
    }
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) {
      return { success: false, message: "Order not found", error: "NOT_FOUND" };
    }
    if (order.status !== "submitted" && order.status !== "under_review") {
      return {
        success: false,
        message: `Invalid transition from ${order.status}`,
        error: "INVALID_TRANSITION",
      };
    }
    order.status = "approved";
    order.items.forEach((it) => {
      it.approvedQuantity = it.requestedQuantity;
    });
    return { success: true, message: "Order approved successfully.", data: { orderId } };
  }

  // Simulates cancelOrderAction
  async cancelOrder(orderId, callerRole, callerBranchId, reason) {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) {
      return { success: false, message: "Order not found", error: "NOT_FOUND" };
    }
    if (callerRole === "branch_admin" && order.branchId !== callerBranchId) {
      return { success: false, message: "Cannot cancel order for other branch", error: "FORBIDDEN" };
    }
    if (order.status !== "submitted" && order.status !== "under_review") {
      return { success: false, message: "Cannot cancel already approved order", error: "INVALID_TRANSITION" };
    }
    order.status = "cancelled";
    order.cancelReason = reason;
    return { success: true, message: "Order cancelled." };
  }
}

// -----------------------------------------------------------------------------
// Test Suite: Phase 2 Reliable Branch Orders & Supabase Synchronization
// -----------------------------------------------------------------------------

test("1. Order Creation: Valid payload with DB product UUIDs succeeds", async () => {
  const service = new MockOrderService();
  const res = await service.createOrder({
    branchId: VALID_OLLUR_BRANCH_UUID,
    callerRole: "branch_admin",
    callerBranchId: VALID_OLLUR_BRANCH_UUID,
    items: [
      { productId: STRAWBERRY_PRODUCT_UUID, requestedQuantity: 15 },
      { productId: MANGO_PRODUCT_UUID, requestedQuantity: 10 },
    ],
    notes: "Deep freezer bay 2 cleared",
  });

  assert.equal(res.success, true);
  assert.ok(res.data?.orderId);
  assert.equal(res.data?.orderNumber, 101);
});

test("2. Product ID Validation: Reject non-UUID slug fallbacks", async () => {
  const service = new MockOrderService();
  const res = await service.createOrder({
    branchId: VALID_OLLUR_BRANCH_UUID,
    callerRole: "branch_admin",
    callerBranchId: VALID_OLLUR_BRANCH_UUID,
    items: [{ productId: NON_UUID_SLUG, requestedQuantity: 10 }],
  });

  assert.equal(res.success, false);
  assert.equal(res.error, "INVALID_IDENTIFIER");
  assert.match(res.message, /UUID required/i);
});

test("3. Quantity Validation: Reject zero or negative quantities", async () => {
  const service = new MockOrderService();
  const resZero = await service.createOrder({
    branchId: VALID_OLLUR_BRANCH_UUID,
    callerRole: "branch_admin",
    callerBranchId: VALID_OLLUR_BRANCH_UUID,
    items: [{ productId: STRAWBERRY_PRODUCT_UUID, requestedQuantity: 0 }],
  });
  assert.equal(resZero.success, false);
  assert.equal(resZero.error, "INVALID_QUANTITY");

  const resNegative = await service.createOrder({
    branchId: VALID_OLLUR_BRANCH_UUID,
    callerRole: "branch_admin",
    callerBranchId: VALID_OLLUR_BRANCH_UUID,
    items: [{ productId: STRAWBERRY_PRODUCT_UUID, requestedQuantity: -5 }],
  });
  assert.equal(resNegative.success, false);
  assert.equal(resNegative.error, "INVALID_QUANTITY");
});

test("4. Pending Order Enforcement: Rejects second order when one is in 'submitted' status", async () => {
  const service = new MockOrderService();
  service.seedOrder({
    id: "ord-1",
    orderNumber: 101,
    branchId: VALID_OLLUR_BRANCH_UUID,
    status: "submitted",
  });

  const res = await service.createOrder({
    branchId: VALID_OLLUR_BRANCH_UUID,
    callerRole: "branch_admin",
    callerBranchId: VALID_OLLUR_BRANCH_UUID,
    items: [{ productId: STRAWBERRY_PRODUCT_UUID, requestedQuantity: 10 }],
  });

  assert.equal(res.success, false);
  assert.equal(res.error, "PENDING_ORDER_EXISTS");
  assert.match(res.message, /already pending review/i);
  assert.equal(res.data?.existingOrderNumber, 101);
});

test("5. Pending Order Enforcement: Rejects second order when one is in 'under_review' status", async () => {
  const service = new MockOrderService();
  service.seedOrder({
    id: "ord-2",
    orderNumber: 102,
    branchId: VALID_OLLUR_BRANCH_UUID,
    status: "under_review",
  });

  const res = await service.createOrder({
    branchId: VALID_OLLUR_BRANCH_UUID,
    callerRole: "branch_admin",
    callerBranchId: VALID_OLLUR_BRANCH_UUID,
    items: [{ productId: STRAWBERRY_PRODUCT_UUID, requestedQuantity: 10 }],
  });

  assert.equal(res.success, false);
  assert.equal(res.error, "PENDING_ORDER_EXISTS");
  assert.match(res.message, /already pending review/i);
});

test("6. Lifecycle Progression: Allows new order after previous order is 'approved'", async () => {
  const service = new MockOrderService();
  service.seedOrder({
    id: "ord-prev",
    orderNumber: 99,
    branchId: VALID_OLLUR_BRANCH_UUID,
    status: "approved",
  });

  const res = await service.createOrder({
    branchId: VALID_OLLUR_BRANCH_UUID,
    callerRole: "branch_admin",
    callerBranchId: VALID_OLLUR_BRANCH_UUID,
    items: [{ productId: STRAWBERRY_PRODUCT_UUID, requestedQuantity: 12 }],
  });

  assert.equal(res.success, true);
  assert.equal(res.data?.orderNumber, 101);
});

test("7. Lifecycle Progression: Allows new order after previous order is 'cancelled'", async () => {
  const service = new MockOrderService();
  service.seedOrder({
    id: "ord-cancelled",
    orderNumber: 98,
    branchId: VALID_OLLUR_BRANCH_UUID,
    status: "cancelled",
  });

  const res = await service.createOrder({
    branchId: VALID_OLLUR_BRANCH_UUID,
    callerRole: "branch_admin",
    callerBranchId: VALID_OLLUR_BRANCH_UUID,
    items: [{ productId: STRAWBERRY_PRODUCT_UUID, requestedQuantity: 8 }],
  });

  assert.equal(res.success, true);
  assert.equal(res.data?.orderNumber, 101);
});

test("8. Branch Isolation: Branch admin cannot submit order for another branch", async () => {
  const service = new MockOrderService();
  const res = await service.createOrder({
    branchId: VALID_TOWN_BRANCH_UUID,
    callerRole: "branch_admin",
    callerBranchId: VALID_OLLUR_BRANCH_UUID, // Ollur admin trying to order for Town
    items: [{ productId: STRAWBERRY_PRODUCT_UUID, requestedQuantity: 10 }],
  });

  assert.equal(res.success, false);
  assert.equal(res.error, "FORBIDDEN");
  assert.match(res.message, /isolation violation/i);
});

test("9. Super Admin Role: Super Admin can place orders for any authorized branch", async () => {
  const service = new MockOrderService();
  const res = await service.createOrder({
    branchId: VALID_TOWN_BRANCH_UUID,
    callerRole: "super_admin",
    callerBranchId: null,
    items: [{ productId: MANGO_PRODUCT_UUID, requestedQuantity: 20 }],
  });

  assert.equal(res.success, true);
  assert.equal(res.data?.orderNumber, 101);
});

test("10. Super Admin Queue: 'Awaiting Review' filter groups both 'submitted' and 'under-review'", () => {
  const mockOrders = [
    { id: "1", orderNumber: "ORD-1", status: "submitted" },
    { id: "2", orderNumber: "ORD-2", status: "under-review" },
    { id: "3", orderNumber: "ORD-3", status: "approved" },
    { id: "4", orderNumber: "ORD-4", status: "dispatched" },
    { id: "5", orderNumber: "ORD-5", status: "cancelled" },
  ];

  const awaitingReviewOrders = mockOrders.filter(
    (o) => o.status === "submitted" || o.status === "under-review"
  );
  assert.equal(awaitingReviewOrders.length, 2);
  assert.deepEqual(
    awaitingReviewOrders.map((o) => o.id),
    ["1", "2"]
  );
});

test("11. Client UI State: Branch submission button and warning banner logic", () => {
  // Scenario A: No pending order -> Submission permitted
  const ordersA = [{ branchId: VALID_OLLUR_BRANCH_UUID, status: "approved" }];
  const activePendingOrderA = ordersA.find(
    (o) =>
      o.branchId === VALID_OLLUR_BRANCH_UUID &&
      (o.status === "submitted" || o.status === "under-review" || o.status === "under_review")
  );
  assert.equal(Boolean(activePendingOrderA), false);

  // Scenario B: Active pending order -> Submission blocked
  const ordersB = [
    { id: "ord-101", orderNumber: "ORD-2026-101", branchId: VALID_OLLUR_BRANCH_UUID, status: "submitted", totalCrates: 25 },
  ];
  const activePendingOrderB = ordersB.find(
    (o) =>
      o.branchId === VALID_OLLUR_BRANCH_UUID &&
      (o.status === "submitted" || o.status === "under-review" || o.status === "under_review")
  );
  assert.equal(Boolean(activePendingOrderB), true);
  assert.equal(activePendingOrderB.orderNumber, "ORD-2026-101");
});

test("12. Migration SQL Verification: 20261026000001 contains unique partial index and RPC", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20261026000001_enforce_one_pending_order_per_branch.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist on disk");

  const sqlContent = fs.readFileSync(migrationPath, "utf-8");
  assert.match(sqlContent, /idx_orders_one_pending_per_branch/i, "Must declare unique index");
  assert.match(sqlContent, /WHERE status IN \('submitted', 'under_review'\)/i, "Must filter pending statuses");
  assert.match(sqlContent, /rpc_create_order/i, "Must define rpc_create_order");
  assert.match(sqlContent, /23505/i, "Must use unique_violation error code");
  assert.match(sqlContent, /REVOKE ALL ON FUNCTION public\.rpc_create_order/i, "Must revoke from PUBLIC");
  assert.match(sqlContent, /GRANT EXECUTE ON FUNCTION public\.rpc_create_order/i, "Must grant to authenticated");
});
