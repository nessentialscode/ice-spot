/**
 * Icespot Supply Chain & Order Approval System — RPC Specification Regression Tests
 *
 * NOTE ON TEST LIMITATIONS:
 * -------------------------
 * These are local in-memory unit tests designed to validate specification logic,
 * input validation patterns, duplicate rejection, numeric format rules, and state machine invariants.
 *
 * SIMULATION SCOPE:
 * - Validates input schemas, regex checks, JSON array/object structures, and pricing calculations.
 * - Simulates atomic transactional state mutation using deep snapshot/commit isolation.
 *
 * WHAT THIS DOES NOT PROVE:
 * - This mock test does NOT execute the PostgreSQL PL/pgSQL engine or verify database-level
 *   concurrency behaviors such as row locking (SELECT ... FOR UPDATE), foreign key triggers,
 *   SECURITY DEFINER context switching, or PostgREST wire serialization.
 * - Real PostgreSQL verification must be conducted in Supabase local Docker or staging database environments.
 */

import test from "node:test";
import assert from "node:assert/strict";

// Canonical RFC 4122 UUID regex (case-insensitive)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Accepted numeric format: non-negative integers or decimals with explicit digits on both sides of the decimal point.
// Examples: 0, 5, 0.5, 12.75.
// Incomplete formats such as .5 (omitted leading digit) and 5. (dangling decimal point) are intentionally rejected.
const NUMERIC_REGEX = /^[0-9]+(\.[0-9]+)?$/;

/**
 * In-memory simulated PostgreSQL database engine.
 * Employs a strict snapshot-and-commit model to test transaction rollback fidelity.
 */
class ApprovalMockEngine {
  constructor() {
    this.orders = new Map();
    this.orderItems = new Map();
    this.products = new Map();
    this.invoices = new Map();
    this.invoiceItems = new Map();
    this.auditLogs = [];
    this.invoiceSeq = 100001n;
  }

  seedProduct(id, sku, name, sellingPrice) {
    this.products.set(id, { id, sku, name, sellingPrice: Number(sellingPrice) });
  }

  createOrder(orderId, orderNumber, branchId, status = "submitted", items = []) {
    this.orders.set(orderId, {
      id: orderId,
      orderNumber,
      branchId,
      status,
      approvedAt: null,
      approvedBy: null,
      notes: null,
    });

    for (const it of items) {
      const key = `${orderId}_${it.productId}`;
      this.orderItems.set(key, {
        orderId,
        productId: it.productId,
        requestedQuantity: Number(it.requestedQuantity),
        approvedQuantity: 0,
        unitPrice: it.unitPrice !== undefined && it.unitPrice !== null ? Number(it.unitPrice) : null,
      });
    }
  }

  /**
   * Simulates public.rpc_approve_order with hardened validation and atomic snapshot rollback.
   */
  rpcApproveOrder(orderId, approvedItems, notes, caller = { isSuperAdmin: true, id: "u-admin-1" }) {
    // 1. Authorization check
    if (!caller?.isSuperAdmin) {
      throw new Error("Unauthorized: Super Admin authority required to approve orders");
    }

    // 2. Order ID presence check
    if (!orderId) {
      throw new Error("Order ID is required");
    }

    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // 3. Status transition check
    if (!["submitted", "under_review", "amendment_requested"].includes(order.status)) {
      throw new Error(`Invalid status transition: Cannot approve order in status ${order.status}`);
    }

    // CREATE ISOLATED TRANSACTION SNAPSHOT (Genuine rollback design: no shared mutations)
    const stagedOrder = { ...order };
    const stagedOrderItems = new Map();
    for (const [key, val] of this.orderItems.entries()) {
      stagedOrderItems.set(key, { ...val });
    }
    const stagedInvoices = new Map(this.invoices);
    const stagedInvoiceItems = new Map(this.invoiceItems);
    const stagedAuditLogs = [...this.auditLogs];

    // 4. Update order status
    stagedOrder.status = "approved";
    stagedOrder.approvedAt = new Date();
    stagedOrder.approvedBy = caller.id;
    stagedOrder.notes = notes || stagedOrder.notes;

    // 5. Validate and update approved quantities
    // In PostgreSQL, SQL NULL (null) and JSONB null ('null'::jsonb) trigger default approval.
    // A text string literal "null" ('"null"'::jsonb) is a JSON string scalar and is rejected as a non-array.
    const isDefaultApprovalPayload =
      approvedItems === null ||
      approvedItems === undefined;

    if (!isDefaultApprovalPayload) {
      // Must be a valid JSON array
      if (!Array.isArray(approvedItems)) {
        throw new Error("p_approved_items must be a JSON array");
      }

      if (approvedItems.length > 0) {
        const seenProductIds = new Set();

        for (const item of approvedItems) {
          // Element must be an object (not primitive, array, or null)
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new Error("Each item in p_approved_items must be a JSON object");
          }

          // Extract and validate product_id
          const rawProductId = item.product_id;
          if (rawProductId === undefined || rawProductId === null || String(rawProductId).trim() === "") {
            throw new Error("Missing or empty product_id in approval item");
          }

          const trimmedProductId = String(rawProductId).trim();
          if (!UUID_REGEX.test(trimmedProductId)) {
            throw new Error(`Invalid UUID format for product_id: ${rawProductId}`);
          }

          const productId = trimmedProductId.toLowerCase();

          // Reject duplicate product IDs in the payload array
          if (seenProductIds.has(productId)) {
            throw new Error(`Duplicate product ID ${productId} supplied in approval items payload`);
          }
          seenProductIds.add(productId);

          // Verify product belongs to the order
          const itemKey = `${orderId}_${productId}`;
          if (!stagedOrderItems.has(itemKey)) {
            throw new Error(`Product ${productId} does not belong to order ${orderId}`);
          }

          // Extract and validate approved_quantity
          const rawQty = item.approved_quantity;
          if (rawQty === undefined || rawQty === null || String(rawQty).trim() === "") {
            throw new Error(`Missing or empty approved_quantity for product ${productId}`);
          }

          const trimmedQty = String(rawQty).trim();
          if (!NUMERIC_REGEX.test(trimmedQty)) {
            throw new Error(`Approved quantity must be a valid non-negative number for product ${productId}: ${trimmedQty}`);
          }

          const numericQty = parseFloat(trimmedQty);
          // Permitted: approved_quantity may exceed requested_quantity (no upper bound check per business rule)
          const lineItem = stagedOrderItems.get(itemKey);
          lineItem.approvedQuantity = numericQty;
        }
      } else {
        // Empty array [] defaults to full requested quantities
        for (const lineItem of stagedOrderItems.values()) {
          if (lineItem.orderId === orderId) {
            lineItem.approvedQuantity = lineItem.requestedQuantity;
          }
        }
      }
    } else {
      // SQL NULL or JSON 'null' defaults to full requested quantities
      for (const lineItem of stagedOrderItems.values()) {
        if (lineItem.orderId === orderId) {
          lineItem.approvedQuantity = lineItem.requestedQuantity;
        }
      }
    }

    // 6. Enforce that at least one item has approved_quantity > 0
    const hasPositiveItem = Array.from(stagedOrderItems.values()).some(
      (it) => it.orderId === orderId && it.approvedQuantity > 0
    );

    if (!hasPositiveItem) {
      throw new Error(
        `Cannot approve order ${orderId}: at least one line item must have an approved quantity greater than zero. If all products are unavailable, reject the order instead.`
      );
    }

    // 7. Atomic Invoice Generation
    const invoiceId = `inv-${orderId}`;
    const invoiceNumber = this.invoiceSeq++;
    let subtotal = 0;

    for (const it of stagedOrderItems.values()) {
      if (it.orderId === orderId && it.approvedQuantity > 0) {
        const product = this.products.get(it.productId);
        // Pricing Fallback: order_items.unit_price takes precedence; falls back to products.selling_price
        const price = it.unitPrice !== null ? it.unitPrice : (product?.sellingPrice ?? 0);
        const lineTotal = Math.round(it.approvedQuantity * price * 100) / 100;
        subtotal += lineTotal;

        stagedInvoiceItems.set(`ii-${invoiceId}-${it.productId}`, {
          invoiceId,
          productId: it.productId,
          quantity: it.approvedQuantity,
          unitPrice: price,
          lineTotal,
        });
      }
    }

    stagedInvoices.set(invoiceId, {
      id: invoiceId,
      invoiceNumber,
      orderId,
      subtotal,
      status: "provisional",
    });

    // 8. Audit Log
    stagedAuditLogs.push({
      actorId: caller.id,
      action: "ORDER_APPROVED",
      entityType: "order",
      entityId: orderId,
      details: {
        order_number: order.orderNumber,
        notes,
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
      },
    });

    // COMMIT ALL STAGED MUTATIONS (Transaction succeeds)
    this.orders.set(orderId, stagedOrder);
    this.orderItems = stagedOrderItems;
    this.invoices = stagedInvoices;
    this.invoiceItems = stagedInvoiceItems;
    this.auditLogs = stagedAuditLogs;

    return {
      success: true,
      order_id: orderId,
      order_number: order.orderNumber,
      status: "approved",
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
    };
  }
}

// =============================================================
// TEST SUITE: ORDER APPROVAL RPC VALIDATION & REGRESSION
// =============================================================

test("1. Reject product IDs that do not belong to the specified order", () => {
  const engine = new ApprovalMockEngine();
  const p1 = "11111111-1111-1111-1111-111111111111";
  const pForeign = "99999999-9999-9999-9999-999999999999";
  engine.seedProduct(p1, "SKU-001", "Vanilla 500ml", 120);
  engine.seedProduct(pForeign, "SKU-FOREIGN", "Foreign Ice Cream", 150);

  const orderId = "22222222-2222-2222-2222-222222222222";
  engine.createOrder(orderId, 1001, "br-ollur", "submitted", [
    { productId: p1, requestedQuantity: 10 },
  ]);

  assert.throws(() => {
    engine.rpcApproveOrder(orderId, [
      { product_id: pForeign, approved_quantity: 5 },
    ]);
  }, /does not belong to order/i);

  // Assert order remains submitted and unapproved
  assert.equal(engine.orders.get(orderId).status, "submitted");
  assert.equal(engine.orderItems.get(`${orderId}_${p1}`).approvedQuantity, 0);
});

test("2. Reject duplicate product IDs in the approval items payload", () => {
  const engine = new ApprovalMockEngine();
  const p1 = "11111111-1111-1111-1111-111111111111";
  engine.seedProduct(p1, "SKU-001", "Vanilla 500ml", 120);

  const orderId = "22222222-2222-2222-2222-222222222222";
  engine.createOrder(orderId, 1002, "br-ollur", "submitted", [
    { productId: p1, requestedQuantity: 10 },
  ]);

  assert.throws(() => {
    engine.rpcApproveOrder(orderId, [
      { product_id: p1, approved_quantity: 4 },
      { product_id: p1, approved_quantity: 6 },
    ]);
  }, /Duplicate product ID .* supplied in approval items payload/i);
});

test("3. Reject malformed payloads: non-array root, non-object item, malformed UUID", () => {
  const engine = new ApprovalMockEngine();
  const p1 = "11111111-1111-1111-1111-111111111111";
  engine.seedProduct(p1, "SKU-001", "Vanilla 500ml", 120);

  const orderId = "22222222-2222-2222-2222-222222222222";
  engine.createOrder(orderId, 1003, "br-ollur", "submitted", [
    { productId: p1, requestedQuantity: 10 },
  ]);

  // Non-array payload (e.g. JSON object passed directly)
  assert.throws(() => {
    engine.rpcApproveOrder(orderId, { product_id: p1, approved_quantity: 5 });
  }, /p_approved_items must be a JSON array/i);

  // String literal "null" ('"null"'::jsonb: scalar string, not an array or true null)
  assert.throws(() => {
    engine.rpcApproveOrder(orderId, "null");
  }, /p_approved_items must be a JSON array/i);

  // Array containing non-object element
  assert.throws(() => {
    engine.rpcApproveOrder(orderId, ["invalid-item-string"]);
  }, /Each item in p_approved_items must be a JSON object/i);

  // Invalid UUID format
  assert.throws(() => {
    engine.rpcApproveOrder(orderId, [
      { product_id: "not-a-valid-uuid", approved_quantity: 5 },
    ]);
  }, /Invalid UUID format for product_id/i);

  // Missing product_id
  assert.throws(() => {
    engine.rpcApproveOrder(orderId, [
      { approved_quantity: 5 },
    ]);
  }, /Missing or empty product_id/i);
});

test("4. Reject invalid quantities: negative, non-numeric, .5, 5., and empty strings", () => {
  const engine = new ApprovalMockEngine();
  const p1 = "11111111-1111-1111-1111-111111111111";
  engine.seedProduct(p1, "SKU-001", "Vanilla 500ml", 120);

  const orderId = "22222222-2222-2222-2222-222222222222";
  engine.createOrder(orderId, 1004, "br-ollur", "submitted", [
    { productId: p1, requestedQuantity: 10 },
  ]);

  // Negative quantity
  assert.throws(() => {
    engine.rpcApproveOrder(orderId, [
      { product_id: p1, approved_quantity: -5 },
    ]);
  }, /Approved quantity must be a valid non-negative number/i);

  // Non-numeric string
  assert.throws(() => {
    engine.rpcApproveOrder(orderId, [
      { product_id: p1, approved_quantity: "twenty" },
    ]);
  }, /Approved quantity must be a valid non-negative number/i);

  // Incomplete decimal: leading dot .5
  assert.throws(() => {
    engine.rpcApproveOrder(orderId, [
      { product_id: p1, approved_quantity: ".5" },
    ]);
  }, /Approved quantity must be a valid non-negative number/i);

  // Incomplete decimal: trailing dot 5.
  assert.throws(() => {
    engine.rpcApproveOrder(orderId, [
      { product_id: p1, approved_quantity: "5." },
    ]);
  }, /Approved quantity must be a valid non-negative number/i);

  // Missing quantity
  assert.throws(() => {
    engine.rpcApproveOrder(orderId, [
      { product_id: p1 },
    ]);
  }, /Missing or empty approved_quantity/i);

  // Empty string quantity
  assert.throws(() => {
    engine.rpcApproveOrder(orderId, [
      { product_id: p1, approved_quantity: "" },
    ]);
  }, /Missing or empty approved_quantity/i);
});

test("5. Reject approval when all approved quantities are zero", () => {
  const engine = new ApprovalMockEngine();
  const p1 = "11111111-1111-1111-1111-111111111111";
  engine.seedProduct(p1, "SKU-001", "Vanilla 500ml", 120);

  const orderId = "22222222-2222-2222-2222-222222222222";
  engine.createOrder(orderId, 1005, "br-ollur", "submitted", [
    { productId: p1, requestedQuantity: 10 },
  ]);

  assert.throws(() => {
    engine.rpcApproveOrder(orderId, [
      { product_id: p1, approved_quantity: 0 },
    ]);
  }, /at least one line item must have an approved quantity greater than zero/i);
});

test("6. Default approval preserves full requested quantities on SQL NULL, JSON null, or empty array", () => {
  const engine = new ApprovalMockEngine();
  const p1 = "11111111-1111-1111-1111-111111111111";
  const p2 = "22222222-2222-2222-2222-222222222222";
  engine.seedProduct(p1, "SKU-001", "Vanilla 500ml", 100);
  engine.seedProduct(p2, "SKU-002", "Chocolate 500ml", 150);

  // Scenario A: SQL NULL
  const o1 = "33333333-3333-3333-3333-333333333331";
  engine.createOrder(o1, 1006, "br-ollur", "submitted", [
    { productId: p1, requestedQuantity: 5 },
    { productId: p2, requestedQuantity: 8 },
  ]);
  const res1 = engine.rpcApproveOrder(o1, null, "Approved full order");
  assert.equal(res1.success, true);
  assert.equal(engine.orderItems.get(`${o1}_${p1}`).approvedQuantity, 5);
  assert.equal(engine.orderItems.get(`${o1}_${p2}`).approvedQuantity, 8);
  assert.equal(engine.invoices.get(res1.invoice_id).subtotal, 1700);

  // Scenario B: JavaScript undefined (omitted parameter)
  const o2 = "33333333-3333-3333-3333-333333333332";
  engine.createOrder(o2, 1007, "br-ollur", "submitted", [
    { productId: p1, requestedQuantity: 4 },
  ]);
  const res2 = engine.rpcApproveOrder(o2, undefined, "Default approval via omitted argument");
  assert.equal(res2.success, true);
  assert.equal(engine.orderItems.get(`${o2}_${p1}`).approvedQuantity, 4);

  // Scenario C: Empty array []
  const o3 = "33333333-3333-3333-3333-333333333333";
  engine.createOrder(o3, 1008, "br-ollur", "submitted", [
    { productId: p2, requestedQuantity: 6 },
  ]);
  const res3 = engine.rpcApproveOrder(o3, [], "Default approval via empty array");
  assert.equal(res3.success, true);
  assert.equal(engine.orderItems.get(`${o3}_${p2}`).approvedQuantity, 6);
});

test("7. Partial approval allocates specific quantities, permits higher quantities, and generates invoice", () => {
  const engine = new ApprovalMockEngine();
  const p1 = "11111111-1111-1111-1111-111111111111";
  const p2 = "22222222-2222-2222-2222-222222222222";
  engine.seedProduct(p1, "SKU-001", "Vanilla 500ml", 100);
  engine.seedProduct(p2, "SKU-002", "Chocolate 500ml", 150);

  const orderId = "44444444-4444-4444-4444-444444444444";
  engine.createOrder(orderId, 1009, "br-ollur", "submitted", [
    { productId: p1, requestedQuantity: 10 },
    { productId: p2, requestedQuantity: 5 },
  ]);

  // Partial approval: p1 reduced to 7; p2 increased to 8 (exceeding requested quantity is permitted by business rule)
  const res = engine.rpcApproveOrder(orderId, [
    { product_id: p1, approved_quantity: 7 },
    { product_id: p2, approved_quantity: "8.5" }, // decimal string also valid
  ], "Partial with bonus");

  assert.equal(res.success, true);
  assert.equal(engine.orderItems.get(`${orderId}_${p1}`).approvedQuantity, 7);
  assert.equal(engine.orderItems.get(`${orderId}_${p2}`).approvedQuantity, 8.5);

  // Invoice calculates: (7 * 100) + (8.5 * 150) = 700 + 1275 = 1975
  const inv = engine.invoices.get(res.invoice_id);
  assert.equal(inv.subtotal, 1975);
  assert.equal(engine.invoiceItems.has(`ii-${res.invoice_id}-${p1}`), true);
  assert.equal(engine.invoiceItems.has(`ii-${res.invoice_id}-${p2}`), true);
});

test("8. Pricing fallback: order_items.unit_price takes precedence over catalog selling price", () => {
  const engine = new ApprovalMockEngine();
  const p1 = "11111111-1111-1111-1111-111111111111";
  const p2 = "22222222-2222-2222-2222-222222222222";
  engine.seedProduct(p1, "SKU-001", "Vanilla 500ml", 100);
  engine.seedProduct(p2, "SKU-002", "Chocolate 500ml", 150);

  const orderId = "55555555-5555-5555-5555-555555555555";
  engine.createOrder(orderId, 1010, "br-ollur", "submitted", [
    { productId: p1, requestedQuantity: 5, unitPrice: 85 }, // custom contract price: 85
    { productId: p2, requestedQuantity: 2, unitPrice: null }, // falls back to catalog price: 150
  ]);

  const res = engine.rpcApproveOrder(orderId, null, "Contract pricing order");
  assert.equal(res.success, true);

  // Expected subtotal: (5 * 85) + (2 * 150) = 425 + 300 = 725
  const inv = engine.invoices.get(res.invoice_id);
  assert.equal(inv.subtotal, 725);
});

test("9. Transaction rollback fidelity: failure midway leaves original state completely untouched", () => {
  const engine = new ApprovalMockEngine();
  const p1 = "11111111-1111-1111-1111-111111111111";
  const pForeign = "99999999-9999-9999-9999-999999999999";
  engine.seedProduct(p1, "SKU-001", "Vanilla 500ml", 100);

  const orderId = "66666666-6666-6666-6666-666666666666";
  engine.createOrder(orderId, 1011, "br-ollur", "submitted", [
    { productId: p1, requestedQuantity: 10 },
  ]);

  // Batch payload where item 1 is valid, but item 2 is foreign product
  assert.throws(() => {
    engine.rpcApproveOrder(orderId, [
      { product_id: p1, approved_quantity: 8 },
      { product_id: pForeign, approved_quantity: 5 },
    ]);
  }, /does not belong to order/i);

  // Assert genuine rollback fidelity:
  // - Order status must remain 'submitted'
  // - approvedQuantity for p1 must remain 0 (not 8)
  // - No invoice or invoice items created
  // - No audit logs recorded
  assert.equal(engine.orders.get(orderId).status, "submitted");
  assert.equal(engine.orderItems.get(`${orderId}_${p1}`).approvedQuantity, 0);
  assert.equal(engine.invoices.size, 0);
  assert.equal(engine.invoiceItems.size, 0);
  assert.equal(engine.auditLogs.length, 0);
});
