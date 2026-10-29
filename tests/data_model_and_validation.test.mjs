import test from "node:test";
import assert from "node:assert/strict";

// Simulated in-memory database engine validating constraints
class MockDatabase {
  constructor() {
    this.branches = new Map();
    this.products = new Map();
    this.inventory = new Map(); // key: `${productId}_${branchId || 'factory'}`
    this.orders = new Map();
    this.orderItems = new Map();
    this.dispatches = new Map();
    this.dispatchOrders = new Map();
    this.dispatchItems = new Map();
    this.receipts = new Map();
    this.receiptItems = new Map();
    this.auditLogs = [];

    this.orderSeq = 10001n;
    this.dispatchSeq = 1001n;
  }

  seedBranch(id, code, name, category) {
    this.branches.set(id, { id, code, name, category, is_active: true });
  }

  seedProduct(id, sku, name) {
    this.products.set(id, { id, sku, name, is_active: true });
  }

  setStock(productId, branchId, quantity) {
    if (quantity < 0) throw new Error("CHECK constraint violation: quantity >= 0");
    const key = `${productId}_${branchId || "factory"}`;
    this.inventory.set(key, { productId, branchId, quantity });
  }

  getStock(productId, branchId) {
    const key = `${productId}_${branchId || "factory"}`;
    return this.inventory.get(key)?.quantity || 0;
  }

  createOrder(branchId, weekStart, items, createdBy) {
    if (!this.branches.has(branchId)) {
      throw new Error(`Foreign key violation: branch ${branchId} does not exist`);
    }
    if (!items || items.length === 0) {
      throw new Error("Order must contain at least one item");
    }

    const orderNumber = this.orderSeq++;
    const orderId = `ord-${orderNumber}`;

    // Verify products & quantities
    for (const it of items) {
      const prod = this.products.get(it.productId);
      if (!prod || !prod.is_active) {
        throw new Error(`Invalid or inactive product UUID: ${it.productId}`);
      }
      if (!it.requestedQuantity || it.requestedQuantity <= 0) {
        throw new Error(`Requested quantity must be positive, got ${it.requestedQuantity}`);
      }
    }

    this.orders.set(orderId, {
      id: orderId,
      orderNumber,
      branchId,
      weekStart,
      status: "submitted",
      createdBy,
      createdAt: new Date(),
    });

    for (const it of items) {
      const itemId = `item-${orderId}-${it.productId}`;
      this.orderItems.set(itemId, {
        id: itemId,
        orderId,
        productId: it.productId,
        requestedQuantity: it.requestedQuantity,
        approvedQuantity: 0,
      });
    }

    this.auditLogs.push({
      actorId: createdBy,
      action: "ORDER_CREATED",
      entityType: "order",
      entityId: orderId,
    });

    return { orderId, orderNumber };
  }

  adjustInventory(productId, branchId, delta, actorId, reason) {
    const current = this.getStock(productId, branchId);
    const newQty = current + delta;
    if (newQty < 0) {
      throw new Error(`Inventory non-negativity violation: Current ${current}, cannot deduct ${Math.abs(delta)}`);
    }
    this.setStock(productId, branchId, newQty);
    this.auditLogs.push({
      actorId,
      action: "INVENTORY_ADJUSTED",
      entityType: "inventory",
      entityId: productId,
      details: { delta, oldQty: current, newQty, reason },
    });
    return newQty;
  }

  createDispatch(orderIds, deliveryStaffId, actorId, items) {
    const dispatchNumber = this.dispatchSeq++;
    const dispatchId = `dsp-${dispatchNumber}`;

    for (const orderId of orderIds) {
      if (!this.orders.has(orderId)) {
        throw new Error(`Order ${orderId} does not exist`);
      }
    }

    this.dispatches.set(dispatchId, {
      id: dispatchId,
      dispatchNumber,
      deliveryStaffId,
      status: "scheduled",
    });

    let seq = 1;
    for (const orderId of orderIds) {
      const stopId = `stop-${dispatchId}-${orderId}`;
      this.dispatchOrders.set(stopId, {
        id: stopId,
        dispatchId,
        orderId,
        sequence: seq++,
        status: "pending",
      });
      const order = this.orders.get(orderId);
      order.status = "ready_for_dispatch";
    }

    if (items) {
      for (const it of items) {
        this.dispatchItems.set(`${dispatchId}_${it.productId}`, {
          dispatchId,
          productId: it.productId,
          quantityLoaded: it.quantityLoaded,
          quantityDelivered: 0,
        });
      }
    }

    return { dispatchId, dispatchNumber };
  }

  updateDeliveryStop(dispatchId, orderId, items) {
    for (const it of items) {
      const dispItem = this.dispatchItems.get(`${dispatchId}_${it.productId}`);
      if (dispItem && it.quantityDelivered > dispItem.quantityLoaded) {
        throw new Error(
          `Delivered quantity (${it.quantityDelivered}) cannot exceed loaded quantity (${dispItem.quantityLoaded})`
        );
      }
      if (it.shortageQuantity > 0 && (!it.notes || !it.notes.trim())) {
        throw new Error("Shortage notes are mandatory when recording partial delivery");
      }
    }

    const order = this.orders.get(orderId);
    if (order) {
      const hasShortage = items.some((i) => (i.shortageQuantity || 0) > 0);
      order.status = hasShortage ? "partially_delivered" : "delivered";
    }
  }

  confirmReceipt(dispatchId, orderId, branchAdminBranchId, items, receiptStatus, notes) {
    const order = this.orders.get(orderId);
    if (!order) throw new Error("Order not found");

    if (order.branchId !== branchAdminBranchId) {
      throw new Error("Branch isolation violation: Cannot confirm receipt for another branch");
    }

    const receiptId = `rcpt-${Date.now()}`;
    this.receipts.set(receiptId, {
      id: receiptId,
      dispatchId,
      receiptStatus,
      notes,
    });

    order.status = "delivered";
    return { success: true, receiptId };
  }
}

// ---------------------- TEST SUITE ----------------------

test("1. Numeric BigInt order numbers and sequence increment", () => {
  const db = new MockDatabase();
  db.seedBranch("b1", "BR-OLL-003", "Ice Spot Ollur", "thrissur_town");
  db.seedProduct("p1", "SKU-STK-001", "Sweet Strawberry");

  const o1 = db.createOrder("b1", "2026-10-19", [{ productId: "p1", requestedQuantity: 10 }], "u1");
  const o2 = db.createOrder("b1", "2026-10-19", [{ productId: "p1", requestedQuantity: 5 }], "u1");

  assert.equal(typeof o1.orderNumber, "bigint");
  assert.equal(o1.orderNumber, 10001n);
  assert.equal(o2.orderNumber, 10002n);
});

test("2. Multiple orders per branch per week are permitted", () => {
  const db = new MockDatabase();
  db.seedBranch("b1", "BR-OLL-003", "Ice Spot Ollur", "thrissur_town");
  db.seedProduct("p1", "SKU-STK-001", "Sweet Strawberry");

  const week = "2026-10-19";
  const o1 = db.createOrder("b1", week, [{ productId: "p1", requestedQuantity: 10 }], "u1");
  const o2 = db.createOrder("b1", week, [{ productId: "p1", requestedQuantity: 15 }], "u1");
  const o3 = db.createOrder("b1", week, [{ productId: "p1", requestedQuantity: 20 }], "u1");

  assert.ok(o1.orderId);
  assert.ok(o2.orderId);
  assert.ok(o3.orderId);
  assert.equal(db.orders.size, 3);
});

test("3. Invalid product UUIDs and non-positive quantities are rejected", () => {
  const db = new MockDatabase();
  db.seedBranch("b1", "BR-OLL-003", "Ice Spot Ollur", "thrissur_town");
  db.seedProduct("p1", "SKU-STK-001", "Sweet Strawberry");

  // Invalid product
  assert.throws(() => {
    db.createOrder("b1", "2026-10-19", [{ productId: "fake-uuid", requestedQuantity: 10 }], "u1");
  }, /Invalid or inactive product/);

  // Zero quantity
  assert.throws(() => {
    db.createOrder("b1", "2026-10-19", [{ productId: "p1", requestedQuantity: 0 }], "u1");
  }, /must be positive/);

  // Negative quantity
  assert.throws(() => {
    db.createOrder("b1", "2026-10-19", [{ productId: "p1", requestedQuantity: -5 }], "u1");
  }, /must be positive/);
});

test("4. Inventory non-negativity is strictly enforced", () => {
  const db = new MockDatabase();
  db.seedProduct("p1", "SKU-STK-001", "Sweet Strawberry");
  db.setStock("p1", null, 50);

  // Valid deduction
  const after50 = db.adjustInventory("p1", null, -30, "admin1", "Dispatch");
  assert.equal(after50, 20);

  // Deduction exceeding available quantity throws error
  assert.throws(() => {
    db.adjustInventory("p1", null, -25, "admin1", "Dispatch");
  }, /Inventory non-negativity violation/);

  assert.equal(db.getStock("p1", null), 20); // Quantity remains unchanged after rollback
});

test("5. Multi-order dispatch trip links all stops sequentially", () => {
  const db = new MockDatabase();
  db.seedBranch("b1", "BR-OLL-003", "Ice Spot Ollur", "thrissur_town");
  db.seedBranch("b2", "BR-TSR-002", "Ice Spot Thrissur Town", "thrissur_town");
  db.seedProduct("p1", "SKU-STK-001", "Sweet Strawberry");

  const o1 = db.createOrder("b1", "2026-10-19", [{ productId: "p1", requestedQuantity: 10 }], "u1");
  const o2 = db.createOrder("b2", "2026-10-19", [{ productId: "p1", requestedQuantity: 20 }], "u2");

  const { dispatchId, dispatchNumber } = db.createDispatch(
    [o1.orderId, o2.orderId],
    "driver-uuid",
    "admin1",
    [{ productId: "p1", quantityLoaded: 30 }]
  );

  assert.equal(typeof dispatchNumber, "bigint");
  assert.equal(db.dispatchOrders.size, 2);
  assert.equal(db.orders.get(o1.orderId).status, "ready_for_dispatch");
  assert.equal(db.orders.get(o2.orderId).status, "ready_for_dispatch");
});

test("6. Delivery quantities exceeding loaded quantities are rejected", () => {
  const db = new MockDatabase();
  db.seedBranch("b1", "BR-OLL-003", "Ice Spot Ollur", "thrissur_town");
  db.seedProduct("p1", "SKU-STK-001", "Sweet Strawberry");

  const o1 = db.createOrder("b1", "2026-10-19", [{ productId: "p1", requestedQuantity: 10 }], "u1");
  const { dispatchId } = db.createDispatch([o1.orderId], "driver1", "admin1", [
    { productId: "p1", quantityLoaded: 10 },
  ]);

  assert.throws(() => {
    db.updateDeliveryStop(dispatchId, o1.orderId, [
      { productId: "p1", quantityDelivered: 15, shortageQuantity: 0 },
    ]);
  }, /cannot exceed loaded quantity/);
});

test("7. Partial delivery requires mandatory shortage notes", () => {
  const db = new MockDatabase();
  db.seedBranch("b1", "BR-OLL-003", "Ice Spot Ollur", "thrissur_town");
  db.seedProduct("p1", "SKU-STK-001", "Sweet Strawberry");

  const o1 = db.createOrder("b1", "2026-10-19", [{ productId: "p1", requestedQuantity: 10 }], "u1");
  const { dispatchId } = db.createDispatch([o1.orderId], "driver1", "admin1", [
    { productId: "p1", quantityLoaded: 10 },
  ]);

  // Missing shortage note throws
  assert.throws(() => {
    db.updateDeliveryStop(dispatchId, o1.orderId, [
      { productId: "p1", quantityDelivered: 8, shortageQuantity: 2, notes: "" },
    ]);
  }, /Shortage notes are mandatory/);

  // With shortage note succeeds
  db.updateDeliveryStop(dispatchId, o1.orderId, [
    { productId: "p1", quantityDelivered: 8, shortageQuantity: 2, notes: "2 damaged in transit" },
  ]);

  assert.equal(db.orders.get(o1.orderId).status, "partially_delivered");
});

test("8. Branch receipt confirmation restricted strictly to own branch", () => {
  const db = new MockDatabase();
  db.seedBranch("b_ollur", "BR-OLL-003", "Ice Spot Ollur", "thrissur_town");
  db.seedBranch("b_palakkad", "BR-PLK-015", "Ice Spot Palakkad", "palakkad");
  db.seedProduct("p1", "SKU-STK-001", "Sweet Strawberry");

  const o_ollur = db.createOrder("b_ollur", "2026-10-19", [{ productId: "p1", requestedQuantity: 10 }], "u1");
  const { dispatchId } = db.createDispatch([o_ollur.orderId], "driver1", "admin1", [
    { productId: "p1", quantityLoaded: 10 },
  ]);

  // Palakkad admin tries to confirm receipt for Ollur order
  assert.throws(() => {
    db.confirmReceipt(dispatchId, o_ollur.orderId, "b_palakkad", [], "intact", "OK");
  }, /Branch isolation violation/);

  // Ollur admin confirms own branch order
  const result = db.confirmReceipt(dispatchId, o_ollur.orderId, "b_ollur", [], "intact", "All good");
  assert.equal(result.success, true);
  assert.equal(db.orders.get(o_ollur.orderId).status, "delivered");
});
