import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ==============================================================================
// ICE SPOT — CRITICAL DELIVERY QUANTITY & PERSISTENCE REGRESSION TESTS
// Tests resolution of 130 crates across 11 product lines, async delivery
// handover persistence, and migration security safeguards.
// ==============================================================================

const STICKS_PER_CRATE = 10;

// Replicate calculateItemsCargo from src/lib/actions/dispatch-helpers.ts
function calculateItemsCargo(items) {
  if (!items || items.length === 0) {
    return { crates: 0, sticks: 0, items: [], hasItems: false };
  }

  const crates = items.reduce(
    (sum, it) => sum + ((it.approvedPacks && it.approvedPacks > 0) ? it.approvedPacks : (it.requestedPacks || 0)),
    0
  );

  const sticks = items.reduce((sum, it) => {
    const itemSticks =
      it.approvedUnits && it.approvedUnits > 0
        ? it.approvedUnits
        : it.packedUnits && it.packedUnits > 0
        ? it.packedUnits
        : ((it.approvedPacks && it.approvedPacks > 0) ? it.approvedPacks : (it.requestedPacks || 0)) * STICKS_PER_CRATE;
    return sum + itemSticks;
  }, 0);

  return {
    crates,
    sticks: sticks > 0 ? sticks : crates * STICKS_PER_CRATE,
    items,
    hasItems: true,
  };
}

// Replicate calculateDispatchCargo
function calculateDispatchCargo(dispatch, ordersList = []) {
  let totalCrates = 0;
  let totalSticks = 0;
  const stopsCargo = {};

  if (dispatch.stops && dispatch.stops.length > 0) {
    for (const stop of dispatch.stops) {
      const sCargo = calculateItemsCargo(stop.items || []);
      stopsCargo[stop.branchId] = sCargo;
      totalCrates += sCargo.crates;
      totalSticks += sCargo.sticks;
    }
  }

  return {
    crates: totalCrates,
    sticks: totalSticks > 0 ? totalSticks : totalCrates * STICKS_PER_CRATE,
    stopsCargo,
  };
}

test("1. 11-product line order reconciles exactly 130 crates (1,300 sticks)", () => {
  // Realistic 11 product lines for ORD-2026-10070 (including Orea Cream)
  const items = [
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

  const totalPacks = items.reduce((sum, it) => sum + it.approvedPacks, 0);
  assert.equal(totalPacks, 130, "Total approved crates across 11 products must equal 130");

  const cargo = calculateItemsCargo(items);
  assert.equal(cargo.crates, 130, "Calculated cargo crates must equal 130");
  assert.equal(cargo.sticks, 1300, "Calculated cargo sticks must equal 1,300");
  assert.equal(cargo.items.length, 11, "Must retain all 11 product lines");
});

test("2. Avoids nullish coalescing trap: items with approvedPacks = 0 or null fall back to requested", () => {
  const items = [
    { productId: "p-01", requestedPacks: 15, approvedPacks: 15 },
    { productId: "p-02", requestedPacks: 10, approvedPacks: 0 }, // 0 approved should fall back if not explicitly zero-locked
    { productId: "p-03", requestedPacks: 8, approvedPacks: null },
  ];

  const cargo = calculateItemsCargo(items);
  // p-01 (15) + p-02 (fallback to 10) + p-03 (fallback to 8) = 33 crates
  assert.equal(cargo.crates, 33, "Crates must properly resolve fallbacks without 0-coalescing drop");
  assert.equal(cargo.sticks, 330, "Sticks must equal 330");
});

test("3. Dispatch cargo accurately computes across single-stop and multi-stop trips", () => {
  const singleStopDispatch = {
    id: "dsp-001",
    stops: [
      {
        id: "stp-01",
        branchId: "bcfbc0e6-7f12-4513-8d7d-8f20bd173ddb",
        orderId: "6fe6bb92-491c-4384-904d-e96726880001",
        items: [
          { productId: "p-01", approvedPacks: 60, approvedUnits: 600 },
          { productId: "p-02", approvedPacks: 30, approvedUnits: 300 },
          { productId: "p-03", approvedPacks: 40, approvedUnits: 400 },
        ],
      },
    ],
  };

  const cargo = calculateDispatchCargo(singleStopDispatch);
  assert.equal(cargo.crates, 130, "Single-stop cargo crates must sum to 130");
  assert.equal(cargo.sticks, 1300, "Single-stop cargo sticks must sum to 1300");
});

test("4. Codebase inspection: Legacy || 24 fallback is replaced by 10 sticks/crate across admin modules", () => {
  const adminContextSrc = fs.readFileSync("src/context/AdminContext.tsx", "utf8");
  const orderDetailModalSrc = fs.readFileSync("src/components/admin/OrderDetailModal.tsx", "utf8");
  const deliveryStaffViewSrc = fs.readFileSync("src/app/admin/delivery/DeliveryStaffView.tsx", "utf8");

  // In AdminContext.tsx:
  assert.doesNotMatch(
    adminContextSrc,
    /item\.productId\)\?\.unitsPerPack\s*\|\|\s*24/,
    "AdminContext.tsx must not use || 24 fallback in totalUnitsRequested"
  );
  assert.doesNotMatch(
    adminContextSrc,
    /prod\?\.unitsPerPack\s*\|\|\s*24/,
    "AdminContext.tsx must not use || 24 fallback in approveOrder"
  );

  // In OrderDetailModal.tsx:
  assert.doesNotMatch(
    orderDetailModalSrc,
    /prod\?\.unitsPerPack\s*\|\|\s*24/,
    "OrderDetailModal.tsx must not use || 24 fallback"
  );

  // In DeliveryStaffView.tsx:
  assert.doesNotMatch(
    deliveryStaffViewSrc,
    /item\.packType\?\.includes\("24"\)\s*\?\s*24\s*:\s*10/,
    "DeliveryStaffView.tsx must not use legacy 24 packType ternary"
  );
});

test("5. AdminContext updateDeliveryStop: async signature and fail-safe rollback on server error", async () => {
  const adminContextSrc = fs.readFileSync("src/context/AdminContext.tsx", "utf8");

  // Verify function signature is async and returns Promise
  assert.match(
    adminContextSrc,
    /const\s+updateDeliveryStop\s*=\s*async\s*\(/,
    "updateDeliveryStop must be an async function"
  );
  assert.match(
    adminContextSrc,
    /Promise<\{\s*success:\s*boolean;\s*message:\s*string\s*\}>/,
    "updateDeliveryStop must return a Promise with success and message"
  );

  // Verify rollback on server failure
  assert.match(
    adminContextSrc,
    /setDispatches\(previousDispatches\)/,
    "updateDeliveryStop must roll back dispatches on failure"
  );
  assert.match(
    adminContextSrc,
    /setOrders\(previousOrders\)/,
    "updateDeliveryStop must roll back orders on failure"
  );

  // Verify refresh sync is triggered on success
  assert.match(
    adminContextSrc,
    /syncDispatchesFromServer\(\)/,
    "updateDeliveryStop must re-sync dispatches from server on success"
  );
});

test("6. DeliveryStaffView: Handover confirmation awaits updateDeliveryStop and handles error without false success", () => {
  const deliveryStaffViewSrc = fs.readFileSync("src/app/admin/delivery/DeliveryStaffView.tsx", "utf8");

  // Verify updateDeliveryStop is awaited
  assert.match(
    deliveryStaffViewSrc,
    /const\s+res\s*=\s*await\s+updateDeliveryStop\(/,
    "DeliveryStaffView must await updateDeliveryStop"
  );

  // Verify error throwing on !res.success
  assert.match(
    deliveryStaffViewSrc,
    /if\s*\(!res\.success\)\s*\{\s*throw new Error\(res\.message\);?\s*\}/,
    "DeliveryStaffView must throw on unsuccessful server response"
  );

  // Verify branch stop status is only marked delivered after update succeeds inside handleMarkStopDelivered
  const markDeliveredBody = deliveryStaffViewSrc.slice(
    deliveryStaffViewSrc.indexOf("const handleMarkStopDelivered"),
    deliveryStaffViewSrc.indexOf("const activeBranch = useMemo")
  );
  const stopStatusIndex = markDeliveredBody.indexOf("setBranchStopStatus");
  const updateDeliveryIndex = markDeliveredBody.indexOf("await updateDeliveryStop");
  assert.ok(
    stopStatusIndex > updateDeliveryIndex,
    "setBranchStopStatus must be called AFTER updateDeliveryStop completes inside handleMarkStopDelivered"
  );
});

test("7. Database Migration Static Audit: 20261029000002_fix_delivery_stop_persistence_and_quantities.sql", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20261029000002_fix_delivery_stop_persistence_and_quantities.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist on disk");

  const sql = fs.readFileSync(migrationPath, "utf8");

  // 1. Transaction wrapping
  assert.match(sql, /^BEGIN;/m, "Migration must begin with BEGIN");
  assert.match(sql, /COMMIT;$/m, "Migration must commit with COMMIT");

  // 2. SECURITY DEFINER and search_path pinning
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.rpc_update_delivery_stop/i, "Must define rpc_update_delivery_stop");
  assert.match(sql, /SECURITY DEFINER/i, "Function must be SECURITY DEFINER");
  assert.match(sql, /SET search_path = ''/i, "Must pin search_path to empty string");

  // 3. Driver assignment & unassigned trip claim
  assert.match(
    sql,
    /IF\s+v_assigned_staff\s+IS\s+NULL\s+AND\s+NOT\s+v_is_super_admin\s+THEN/i,
    "Must allow authenticated delivery staff to claim unassigned trips"
  );

  // 4. Quantity loaded reconciliation without silent GREATEST inflation
  assert.match(
    sql,
    /Delivered quantity \(%\) cannot exceed loaded quantity \(%\)/i,
    "Must enforce delivered quantity cannot exceed loaded quantity"
  );
  assert.doesNotMatch(
    sql,
    /quantity_loaded\s*=\s*GREATEST/i,
    "Must not silently inflate loaded quantity with GREATEST"
  );

  // 5. Orders table status synchronization
  assert.match(
    sql,
    /UPDATE public\.orders\s+SET status = 'delivered'::public\.order_status/i,
    "Must synchronize orders status to delivered"
  );

  // 6. PoLP Privilege grants
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.rpc_update_delivery_stop.*FROM PUBLIC,\s*anon/i,
    "Must revoke execute from PUBLIC and anon"
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.rpc_update_delivery_stop.*TO authenticated/i,
    "Must grant execute strictly to authenticated"
  );
});
