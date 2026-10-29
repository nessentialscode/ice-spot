import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Simulated PostgreSQL transactional engine with the Stock Accounting Invariant
class StockInvariantSimulator {
  constructor() {
    this.factoryInventory = new Map(); // key: productId -> { onHand, reserved }
    this.branchInventory = new Map();  // key: `${branchId}_${productId}` -> { onHand }
    this.receipts = new Map();         // key: `${dispatchId}_${orderId}` -> receiptId
    this.dispatches = new Map();       // key: dispatchId -> { dispatchId, orderIds, items, status }
    this.orders = new Map();           // key: orderId -> { orderId, branchId, status }
  }

  setFactoryStock(productId, onHand) {
    this.factoryInventory.set(productId, { onHand, reserved: 0 });
  }

  getFactoryStock(productId) {
    const s = this.factoryInventory.get(productId) || { onHand: 0, reserved: 0 };
    return {
      onHand: s.onHand,
      reserved: s.reserved,
      available: s.onHand - s.reserved,
    };
  }

  getBranchStock(branchId, productId) {
    const key = `${branchId}_${productId}`;
    return this.branchInventory.get(key)?.onHand || 0;
  }

  registerOrder(orderId, branchId, status = "approved") {
    this.orders.set(orderId, { orderId, branchId, status });
  }

  // 1. Dispatch Creation with Stock Reservation & Double-Dispatch Prevention
  createDispatch(dispatchId, orderIds, items) {
    // Check for double dispatch
    for (const orderId of orderIds) {
      for (const [, disp] of this.dispatches) {
        if (disp.orderIds.includes(orderId) && disp.status !== "completed" && disp.status !== "cancelled") {
          throw new Error(`Order ${orderId} is already attached to an active dispatch trip`);
        }
      }
    }

    // Validate availability for each product
    for (const item of items) {
      const stock = this.getFactoryStock(item.productId);
      if (stock.available < item.quantityLoaded) {
        throw new Error(
          `Insufficient available factory stock for product ${item.productId}: on-hand ${stock.onHand}, reserved ${stock.reserved}, available ${stock.available}, requested ${item.quantityLoaded}`
        );
      }
    }

    // Reserve stock atomically
    for (const item of items) {
      const current = this.factoryInventory.get(item.productId);
      current.reserved += item.quantityLoaded;
    }

    this.dispatches.set(dispatchId, { dispatchId, orderIds, items, status: "scheduled" });
    return { success: true, dispatchId };
  }

  // 2. Receipt Confirmation Enforcing Invariant & Idempotency
  confirmReceipt(dispatchId, orderId, branchId, receivedItems) {
    const order = this.orders.get(orderId);
    if (order && order.branchId !== branchId) {
      throw new Error(`Branch isolation violation: Cannot confirm receipt for another branch`);
    }

    const idempotencyKey = `${dispatchId}_${orderId}`;
    if (this.receipts.has(idempotencyKey)) {
      return {
        success: true,
        receiptId: this.receipts.get(idempotencyKey),
        alreadyConfirmed: true,
        message: "Receipt was already confirmed",
      };
    }

    const receiptId = `rcpt-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    for (const item of receivedItems) {
      const { productId, quantityExpected, quantityReceived } = item;
      if (quantityReceived > quantityExpected) {
        throw new Error(`Received quantity cannot exceed expected quantity`);
      }

      const factory = this.factoryInventory.get(productId);
      if (!factory) {
        throw new Error(`Product ${productId} not found in factory inventory`);
      }

      if (factory.onHand < quantityReceived) {
        throw new Error(`Factory inventory deficit: on-hand ${factory.onHand} < ${quantityReceived}`);
      }

      // INVARIANT RULE:
      // Deduct ONLY what was received from factory on-hand AND from factory reserved
      // The shortage remains reserved until explicitly reconciled!
      factory.onHand = Math.max(0, factory.onHand - quantityReceived);
      factory.reserved = Math.max(0, factory.reserved - quantityReceived);

      // Credit branch inventory with received amount
      const branchKey = `${branchId}_${productId}`;
      const branchCurrent = this.branchInventory.get(branchKey)?.onHand || 0;
      this.branchInventory.set(branchKey, { onHand: branchCurrent + quantityReceived });
    }

    this.receipts.set(idempotencyKey, receiptId);
    return {
      success: true,
      receiptId,
      alreadyConfirmed: false,
    };
  }

  // 3. Inventory Adjustment & Shortage Reconciliation
  adjustInventory(productId, branchId, delta, reason, releaseReserved = 0) {
    if (branchId === null || branchId === undefined) {
      // Factory Inventory
      const factory = this.factoryInventory.get(productId) || { onHand: 0, reserved: 0 };
      if (releaseReserved > 0) {
        if (releaseReserved > factory.reserved) {
          throw new Error(`Cannot release ${releaseReserved} reserved units: only ${factory.reserved} currently reserved`);
        }
        factory.reserved -= releaseReserved;
      }

      const newQty = factory.onHand + delta;
      if (newQty < 0) {
        throw new Error(`Cannot deduct: current inventory is ${factory.onHand}`);
      }
      if (newQty < factory.reserved) {
        throw new Error(`Cannot reduce inventory to ${newQty} below reserved quantity ${factory.reserved}`);
      }

      factory.onHand = newQty;
      this.factoryInventory.set(productId, factory);
      return { success: true, onHand: factory.onHand, reserved: factory.reserved };
    } else {
      // Branch Inventory
      const key = `${branchId}_${productId}`;
      const current = this.branchInventory.get(key)?.onHand || 0;
      const newQty = current + delta;
      if (newQty < 0) {
        throw new Error(`Cannot deduct below 0`);
      }
      this.branchInventory.set(key, { onHand: newQty });
      return { success: true, onHand: newQty, reserved: 0 };
    }
  }
}

// ---------------------- TESTS ----------------------

test("1. Stock Invariant: Exact reconciliation (100 on-hand, 30 loaded, 28 received, 2 short)", () => {
  const engine = new StockInvariantSimulator();
  const PROD = "prod-strawberry";
  const BRANCH = "branch-ollur";

  // Initial factory state: 100 on-hand, 0 reserved
  engine.setFactoryStock(PROD, 100);
  assert.deepEqual(engine.getFactoryStock(PROD), { onHand: 100, reserved: 0, available: 100 });

  // Dispatch reserves 30 units
  engine.createDispatch("disp-1", ["ord-1"], [{ productId: PROD, quantityLoaded: 30 }]);

  // After dispatch reservation:
  // On-hand remains 100, reserved is 30, available is 70
  assert.deepEqual(engine.getFactoryStock(PROD), { onHand: 100, reserved: 30, available: 70 });
  assert.equal(engine.getBranchStock(BRANCH, PROD), 0);

  // Branch receives 28 (shortage: 2)
  const result = engine.confirmReceipt("disp-1", "ord-1", BRANCH, [
    { productId: PROD, quantityExpected: 30, quantityReceived: 28 },
  ]);

  assert.equal(result.success, true);
  assert.equal(result.alreadyConfirmed, false);

  // Post-receipt factory state:
  // Factory on-hand becomes 72 (100 - 28)
  // Factory reserved becomes 2 (30 - 28)
  // Factory available stock remains 70 (72 - 2)
  // Branch on-hand becomes 28
  assert.deepEqual(engine.getFactoryStock(PROD), { onHand: 72, reserved: 2, available: 70 });
  assert.equal(engine.getBranchStock(BRANCH, PROD), 28);

  // Total physical units in network: 72 (factory) + 28 (branch) = 100.
  // 2 units remain explicitly reserved / unresolved on the manifest.
  assert.equal(engine.getFactoryStock(PROD).onHand + engine.getBranchStock(BRANCH, PROD), 100);
});

test("2. Idempotent receipt confirmation: duplicate calls do not double-decrement stock", () => {
  const engine = new StockInvariantSimulator();
  const PROD = "prod-mango";
  const BRANCH = "branch-guruvayur";

  engine.setFactoryStock(PROD, 50);
  engine.createDispatch("disp-2", ["ord-2"], [{ productId: PROD, quantityLoaded: 20 }]);

  // First receipt call
  const call1 = engine.confirmReceipt("disp-2", "ord-2", BRANCH, [
    { productId: PROD, quantityExpected: 20, quantityReceived: 20 },
  ]);
  assert.equal(call1.success, true);
  assert.equal(call1.alreadyConfirmed, false);
  assert.equal(engine.getFactoryStock(PROD).onHand, 30);
  assert.equal(engine.getBranchStock(BRANCH, PROD), 20);

  // Duplicate retry call (network retry or re-click)
  const call2 = engine.confirmReceipt("disp-2", "ord-2", BRANCH, [
    { productId: PROD, quantityExpected: 20, quantityReceived: 20 },
  ]);
  assert.equal(call2.success, true);
  assert.equal(call2.alreadyConfirmed, true);

  // Stock must NOT have decremented a second time!
  assert.equal(engine.getFactoryStock(PROD).onHand, 30);
  assert.equal(engine.getBranchStock(BRANCH, PROD), 20);
});

test("3. Dispatch creation rejects allocation exceeding available stock", () => {
  const engine = new StockInvariantSimulator();
  const PROD = "prod-chocolate";

  engine.setFactoryStock(PROD, 40);
  // Reserve 35
  engine.createDispatch("disp-3", ["ord-3"], [{ productId: PROD, quantityLoaded: 35 }]);
  assert.equal(engine.getFactoryStock(PROD).available, 5);

  // Trying to allocate 10 when available is 5 must be rejected
  assert.throws(() => {
    engine.createDispatch("disp-4", ["ord-4"], [{ productId: PROD, quantityLoaded: 10 }]);
  }, /Insufficient available factory stock/);

  // Available remains 5
  assert.equal(engine.getFactoryStock(PROD).available, 5);
});

test("4. Multi-stop dispatch receipt isolation: branch A confirming does not block branch B", () => {
  const engine = new StockInvariantSimulator();
  const PROD = "prod-coconut";
  const BRANCH_A = "branch-ollur";
  const BRANCH_B = "branch-town";

  engine.setFactoryStock(PROD, 100);
  engine.registerOrder("ord-A", BRANCH_A);
  engine.registerOrder("ord-B", BRANCH_B);

  // Create dispatch with 2 stops (30 for A, 20 for B -> 50 reserved)
  engine.createDispatch("disp-multi", ["ord-A", "ord-B"], [
    { productId: PROD, quantityLoaded: 50 },
  ]);

  assert.deepEqual(engine.getFactoryStock(PROD), { onHand: 100, reserved: 50, available: 50 });

  // Stop A confirms receipt of 30
  const resA = engine.confirmReceipt("disp-multi", "ord-A", BRANCH_A, [
    { productId: PROD, quantityExpected: 30, quantityReceived: 30 },
  ]);
  assert.equal(resA.success, true);
  assert.equal(resA.alreadyConfirmed, false);
  assert.equal(engine.getBranchStock(BRANCH_A, PROD), 30);
  assert.deepEqual(engine.getFactoryStock(PROD), { onHand: 70, reserved: 20, available: 50 });

  // Stop B confirms receipt of 20 - must NOT be blocked by Stop A!
  const resB = engine.confirmReceipt("disp-multi", "ord-B", BRANCH_B, [
    { productId: PROD, quantityExpected: 20, quantityReceived: 20 },
  ]);
  assert.equal(resB.success, true);
  assert.equal(resB.alreadyConfirmed, false);
  assert.equal(engine.getBranchStock(BRANCH_B, PROD), 20);
  assert.deepEqual(engine.getFactoryStock(PROD), { onHand: 50, reserved: 0, available: 50 });
});

test("5. Shortage reconciliation: releases reserved stock explicitly via audit/write-off", () => {
  const engine = new StockInvariantSimulator();
  const PROD = "prod-blueberry";
  const BRANCH = "branch-kadampuzha";

  engine.setFactoryStock(PROD, 100);
  engine.registerOrder("ord-short", BRANCH);
  engine.createDispatch("disp-short", ["ord-short"], [{ productId: PROD, quantityLoaded: 30 }]);

  // Received 28, shortage 2
  engine.confirmReceipt("disp-short", "ord-short", BRANCH, [
    { productId: PROD, quantityExpected: 30, quantityReceived: 28 },
  ]);

  // State: 72 on-hand, 2 reserved
  assert.deepEqual(engine.getFactoryStock(PROD), { onHand: 72, reserved: 2, available: 70 });

  // Reconciliation Case 1: Damaged/Lost Goods Write-off (deduct 2 on-hand and release 2 reserved)
  engine.adjustInventory(PROD, null, -2, "Damaged in transit write-off", 2);
  assert.deepEqual(engine.getFactoryStock(PROD), { onHand: 70, reserved: 0, available: 70 });
});

test("6. Double-dispatch prevention: active order cannot be dispatched twice", () => {
  const engine = new StockInvariantSimulator();
  const PROD = "prod-kiwi";

  engine.setFactoryStock(PROD, 100);
  engine.createDispatch("disp-first", ["ord-101"], [{ productId: PROD, quantityLoaded: 10 }]);

  // Attempting to attach ord-101 to a second concurrent dispatch must fail
  assert.throws(() => {
    engine.createDispatch("disp-second", ["ord-101"], [{ productId: PROD, quantityLoaded: 10 }]);
  }, /already attached to an active dispatch trip/);
});

test("7. Static Migration SQL Security & Schema Hardening Audit", () => {
  const migrationPath = path.resolve(process.cwd(), "supabase/migrations/20261023000000_icespot_initial_schema.sql");
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist");

  const sql = fs.readFileSync(migrationPath, "utf-8");

  // 1. All 6 RPC functions must have SECURITY DEFINER
  const rpcs = [
    "rpc_create_order",
    "rpc_approve_order",
    "rpc_create_dispatch",
    "rpc_update_delivery_stop",
    "rpc_adjust_inventory",
    "rpc_confirm_receipt",
  ];

  for (const rpc of rpcs) {
    const fnRegex = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}[\\s\\S]*?AS \\$\\$`, "i");
    const match = sql.match(fnRegex);
    assert.ok(match, `RPC function ${rpc} must be defined`);
    assert.ok(match[0].includes("SECURITY DEFINER"), `RPC ${rpc} must be SECURITY DEFINER`);
    assert.ok(match[0].includes("SET search_path = ''"), `RPC ${rpc} must enforce SET search_path = ''`);
  }

  // 2. Unsafe search_path must NOT be present anywhere in the migration
  assert.ok(!sql.includes("search_path = public, pg_temp"), "Must NOT contain unsafe search_path = public, pg_temp");

  // 3. Default function execution privileges revoked from PUBLIC and anon
  assert.ok(
    sql.includes("ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;"),
    "Default privileges must revoke execution from PUBLIC and anon"
  );
  assert.ok(
    sql.includes("REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;"),
    "Must revoke all on all functions in schema public from PUBLIC, anon"
  );

  // 4. Concurrency uniqueness on receipts
  assert.ok(
    sql.includes("CONSTRAINT uq_receipts_dispatch_order UNIQUE (dispatch_id, order_id)"),
    "Receipts must have unique constraint on (dispatch_id, order_id) for race condition prevention"
  );

  // 5. Inventory non-negativity and reservation constraint
  assert.ok(
    sql.includes("CHECK (quantity >= 0)"),
    "Inventory must enforce CHECK (quantity >= 0)"
  );
  assert.ok(
    sql.includes("CONSTRAINT inventory_reserved_not_over_quantity CHECK (reserved_quantity <= quantity)"),
    "Inventory must enforce CHECK (reserved_quantity <= quantity)"
  );
});

test("8. Static SQL syntax validation: parser-level special expressions must not be schema-qualified", () => {
  const migrationPath = path.resolve(process.cwd(), "supabase/migrations/20261023000000_icespot_initial_schema.sql");
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist");

  const sql = fs.readFileSync(migrationPath, "utf-8");

  // Under PostgreSQL parser rules (SQL standard 9.18), COALESCE, NULLIF, GREATEST, LEAST are
  // special syntactic expressions/keywords and NOT schema-bound functions in pg_proc.
  // Schema-qualifying them (e.g. pg_catalog.coalesce) fails with ERROR 42883 (function does not exist).
  const invalidSpecialExprRegex = /pg_catalog\s*\.\s*(coalesce|nullif|greatest|least)\s*\(/gi;
  const matches = sql.match(invalidSpecialExprRegex);

  assert.equal(
    matches,
    null,
    `Found invalid schema-qualified special expressions in migration: ${matches ? matches.join(", ") : ""}`
  );

  // Verify that valid expression syntax is present
  assert.ok(/\bCOALESCE\s*\(/i.test(sql), "Migration must use standard COALESCE(...) expression");
  assert.ok(/\bNULLIF\s*\(/i.test(sql), "Migration must use standard NULLIF(...) expression");
  assert.ok(/\bGREATEST\s*\(/i.test(sql), "Migration must use standard GREATEST(...) expression");
});

