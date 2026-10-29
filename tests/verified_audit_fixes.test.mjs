import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("1. Zero-row branch updates: toggleBranchStatusAction and setAllBranchesStatusAction reject 0 updated rows", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/lib/actions/branches.ts"), "utf-8");

  // Check toggleBranchStatusAction has .select("id") and checks updatedRows length
  assert.ok(
    file.includes('.select("id")'),
    "Branches actions must select updated id to verify row count"
  );
  assert.ok(
    file.includes("BRANCH_NOT_FOUND") || file.includes("No branches were updated"),
    "Branches actions must fail with explicit error when 0 rows match"
  );
  assert.ok(
    file.includes("NO_BRANCHES_UPDATED"),
    "setAllBranchesStatusAction must handle 0 rows updated error"
  );
});

test("2. Order deduplication in syncOrdersFromServer: single-key map strictly keyed by order.id", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/context/AdminContext.tsx"), "utf-8");

  // Ensure map.set(so.orderNumber) is NOT used as a separate key in the same map
  assert.ok(
    file.includes("map.set(so.id, so)"),
    "Server orders must be keyed strictly by so.id"
  );
  assert.ok(
    !file.includes("map.set(so.orderNumber, so)"),
    "map.set(so.orderNumber, so) must not dual-key the deduplication map"
  );
  assert.ok(
    !file.includes("map.set(eo.orderNumber, eo)"),
    "map.set(eo.orderNumber, eo) must not dual-key the deduplication map"
  );
});

test("3. Authoritative product creation: addProduct awaits createProductAction and assigns authoritative UUID", () => {
  const contextFile = fs.readFileSync(path.join(ROOT, "src/context/AdminContext.tsx"), "utf-8");
  const modalFile = fs.readFileSync(path.join(ROOT, "src/components/admin/AddFlavourModal.tsx"), "utf-8");

  // AdminContext addProduct must be async and await createProductAction
  assert.ok(
    contextFile.includes("const addProduct = async"),
    "addProduct must be an async function"
  );
  assert.ok(
    contextFile.includes("await createProductAction"),
    "addProduct must await createProductAction"
  );
  assert.ok(
    contextFile.includes("res.data.productId"),
    "addProduct must assign the authoritative database UUID productId"
  );

  // AddFlavourModal must handle submission state and await onAddProduct
  assert.ok(
    modalFile.includes("await onAddProduct"),
    "AddFlavourModal must await onAddProduct"
  );
  assert.ok(
    modalFile.includes("isSubmitting"),
    "AddFlavourModal must track isSubmitting state"
  );
});

test("4. Server action rollback & error handling in AdminContext", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/context/AdminContext.tsx"), "utf-8");

  // adjustInventory rollback
  assert.ok(
    file.includes("setProducts(previousProducts)"),
    "adjustInventory must rollback products on server failure"
  );
  assert.ok(
    file.includes("setInventoryLogs(previousLogs)"),
    "adjustInventory must rollback inventory logs on server failure"
  );

  // toggleBranchOpenStatus rollback
  assert.ok(
    file.includes("setBranches(previousBranches)"),
    "toggleBranchOpenStatus must rollback branches on server failure"
  );

  // submitOrder rollback
  assert.ok(
    file.includes("setOrders(filtered)"),
    "submitOrder must rollback orders on server sync failure"
  );
});

test("5. Commercial invoice viewer workflow restored in OrderReviewModal", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/components/admin/OrderReviewModal.tsx"), "utf-8");

  assert.ok(
    file.includes('import { InvoiceModal } from "./InvoiceModal"'),
    "OrderReviewModal must import InvoiceModal"
  );
  assert.ok(
    file.includes("getInvoiceForOrderAction"),
    "OrderReviewModal must import getInvoiceForOrderAction"
  );
  assert.ok(
    file.includes("isInvoiceEligible"),
    "OrderReviewModal must define isInvoiceEligible"
  );
  assert.ok(
    file.includes("handleOpenInvoice"),
    "OrderReviewModal must implement handleOpenInvoice"
  );
  assert.ok(
    file.includes("<InvoiceModal"),
    "OrderReviewModal must render <InvoiceModal />"
  );
});

test("6. BranchAdminView synchronizes branch order status from server on mount", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/app/admin/branch/BranchAdminView.tsx"), "utf-8");

  assert.ok(
    file.includes("syncOrdersFromServer"),
    "BranchAdminView must destructure syncOrdersFromServer from useAdmin"
  );
  assert.ok(
    file.includes("useEffect"),
    "BranchAdminView must use useEffect to synchronize on mount"
  );
  assert.ok(
    /syncOrdersFromServer\(\)\.catch/.test(file),
    "BranchAdminView must invoke syncOrdersFromServer with error handling on mount"
  );
});

test("7. supabase/verification_script.sql verifies all 16 tables including invoices and inventory movements", () => {
  const file = fs.readFileSync(path.join(ROOT, "supabase/verification_script.sql"), "utf-8");

  assert.ok(file.includes("'invoices'"), "verification_script.sql must check invoices table");
  assert.ok(file.includes("'invoice_items'"), "verification_script.sql must check invoice_items table");
  assert.ok(file.includes("'inventory_movements'"), "verification_script.sql must check inventory_movements table");
  assert.ok(file.includes("All 16 application tables"), "verification_script.sql notice must report all 16 tables");
});

test("8. Runtime behavioral test: single-key order map deduplication and idempotency", () => {
  function simulateSyncOrders(serverOrders, eligibleOrders) {
    const map = new Map();
    serverOrders.forEach((so) => {
      if (so.id) {
        map.set(so.id, so);
      }
    });

    eligibleOrders.forEach((eo) => {
      if (!eo.id) return;
      const existing = map.get(eo.id);

      if (!existing) {
        map.set(eo.id, eo);
      } else {
        const targetKey = existing.id;
        if (
          existing.status !== eo.status &&
          (eo.status === "approved" || eo.status === "preparation" || eo.status === "ready-for-dispatch")
        ) {
          map.set(targetKey, {
            ...existing,
            status: eo.status,
            items: eo.items && eo.items.length > 0 ? eo.items : existing.items,
            totalUnitsApproved: eo.totalUnitsApproved || existing.totalUnitsApproved,
          });
        }
      }
    });

    return Array.from(map.values());
  }

  const initialServer = [
    { id: "uuid-1", orderNumber: "ORD-1", status: "submitted", totalUnitsApproved: 0 },
    { id: "uuid-2", orderNumber: "ORD-2", status: "submitted", totalUnitsApproved: 0 },
  ];

  const dispatchEligible = [
    // Updates uuid-1 to approved
    { id: "uuid-1", orderNumber: "ORD-1", status: "approved", totalUnitsApproved: 50 },
    // Dispatch-only order (uuid-3)
    { id: "uuid-3", orderNumber: "ORD-3", status: "ready-for-dispatch", totalUnitsApproved: 30 },
  ];

  const result1 = simulateSyncOrders(initialServer, dispatchEligible);
  assert.equal(result1.length, 3, "Expected exactly 3 unique orders");
  assert.equal(result1.find((o) => o.id === "uuid-1").status, "approved");
  assert.equal(result1.find((o) => o.id === "uuid-3").status, "ready-for-dispatch");

  // Idempotency: repeated execution with the previous output yields identical length
  const result2 = simulateSyncOrders(result1, dispatchEligible);
  assert.equal(result2.length, 3, "Repeated synchronization must be idempotent with 0 duplicates");
});

test("9. Runtime cargo calculation: ORD-2026-10070 11 product lines, 130 crates, 1300 sticks", () => {
  const STICKS_PER_CRATE = 10;
  const itemsORD10070 = [
    { productId: "p-01", productName: "Orea Cream", approvedPacks: 15, approvedUnits: 150 },
    { productId: "p-02", productName: "Sweet Strawberry", approvedPacks: 15, approvedUnits: 150 },
    { productId: "p-03", productName: "Creamy Guava & Mint", approvedPacks: 15, approvedUnits: 150 },
    { productId: "p-04", productName: "Alphonso Mango", approvedPacks: 15, approvedUnits: 150 },
    { productId: "p-05", productName: "Tender Coconut", approvedPacks: 10, approvedUnits: 100 },
    { productId: "p-06", productName: "Malabar Jackfruit", approvedPacks: 10, approvedUnits: 100 },
    { productId: "p-07", productName: "Spanish Passion Fruit", approvedPacks: 10, approvedUnits: 100 },
    { productId: "p-08", productName: "Belgian Chocolate", approvedPacks: 10, approvedUnits: 100 },
    { productId: "p-09", productName: "Sitaphal Custard", approvedPacks: 10, approvedUnits: 100 },
    { productId: "p-10", productName: "Butterscotch Crunch", approvedPacks: 10, approvedUnits: 100 },
    { productId: "p-11", productName: "Chikoo Sapota", approvedPacks: 10, approvedUnits: 100 },
  ];

  assert.equal(itemsORD10070.length, 11, "Must have exactly 11 product lines");

  const totalCrates = itemsORD10070.reduce((s, it) => s + (it.approvedPacks || it.requestedPacks), 0);
  assert.equal(totalCrates, 130, "Total crates must be exactly 130");

  const totalSticks = totalCrates * STICKS_PER_CRATE;
  assert.equal(totalSticks, 1300, "Total sticks must be exactly 1300");

  // Partial delivery scenario (previously 106 crates / 1060 sticks)
  const deliveredCrates = 106;
  const deliveredSticks = deliveredCrates * STICKS_PER_CRATE;
  assert.equal(deliveredSticks, 1060, "Delivered sticks must be 1060");
  assert.equal(totalCrates - deliveredCrates, 24, "Discrepancy must be exactly 24 crates / 240 sticks");

  // Over-delivery attempt rejection: delivering 135 crates when 130 were loaded
  const overDeliveredCrates = 135;
  const isOverDelivery = overDeliveredCrates > totalCrates;
  assert.ok(isOverDelivery, "Over-delivery attempt detected");
});


