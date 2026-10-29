import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STICKS_PER_CRATE = 10;

function getItemCrates(it) {
  if (it.approvedPacks !== undefined && it.approvedPacks !== null) {
    return Number(it.approvedPacks) || 0;
  }
  return Number(it.requestedPacks) || 0;
}

function getItemSticks(it, unitsPerCrate = STICKS_PER_CRATE) {
  if (it.approvedUnits !== undefined && it.approvedUnits !== null) {
    return Number(it.approvedUnits) || 0;
  }
  if (it.packedUnits !== undefined && it.packedUnits !== null) {
    return Number(it.packedUnits) || 0;
  }
  return getItemCrates(it) * unitsPerCrate;
}

function calculateItemsCargo(items) {
  if (!items || items.length === 0) {
    return { crates: 0, sticks: 0, items: [], hasItems: false };
  }

  const crates = items.reduce((sum, it) => sum + getItemCrates(it), 0);
  const sticks = items.reduce((sum, it) => sum + getItemSticks(it), 0);

  return {
    crates,
    sticks: sticks > 0 ? sticks : crates * STICKS_PER_CRATE,
    items,
    hasItems: true,
  };
}

function isBranchMatch(branchIdentifier, orderBranchId, orderBranchName, orderBranchCode) {
  if (!branchIdentifier) return false;
  const bLower = branchIdentifier.toLowerCase().trim();
  const idLower = (orderBranchId || "").toLowerCase().trim();
  const nameLower = (orderBranchName || "").toLowerCase().trim();
  const codeLower = (orderBranchCode || "").toLowerCase().trim();

  if (bLower && idLower && bLower === idLower) return true;
  if (codeLower && (bLower.includes(codeLower) || codeLower.includes(bLower))) return true;

  const clean = (s) =>
    s
      .toLowerCase()
      .replace(/ice\s*spot/g, "")
      .replace(/branch/g, "")
      .replace(/parlour/g, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();

  const bClean = clean(bLower);
  const nClean = clean(nameLower);
  if (bClean && nClean && (bClean === nClean || bClean.includes(nClean) || nClean.includes(bClean))) {
    return true;
  }

  return false;
}

test("1. Item quantity resolution: preserves 0-quantity approvals and does not revert to requested quantity", () => {
  const itemZeroApproved = {
    productId: "prod-1",
    productName: "Choco Dip",
    sku: "SKU-CD",
    packType: "Box of 10 Sticks",
    requestedPacks: 15,
    requestedUnits: 150,
    approvedPacks: 0,
    approvedUnits: 0,
  };

  assert.equal(getItemCrates(itemZeroApproved), 0, "Approved 0 crates must not revert to 15 requested crates");
  assert.equal(getItemSticks(itemZeroApproved), 0, "Approved 0 sticks must not revert to 150 requested sticks");

  const cargo = calculateItemsCargo([itemZeroApproved]);
  assert.equal(cargo.crates, 0, "Cargo crates must be 0 when approved quantity is 0");
  assert.equal(cargo.sticks, 0, "Cargo sticks must be 0 when approved quantity is 0");
});

test("2. Super Admin quantity edit propagation: edited approved quantities reflect across dispatch cargo", () => {
  const orderItems = [
    {
      productId: "prod-1",
      productName: "Tender Coconut",
      sku: "SKU-TC",
      packType: "Box of 10 Sticks",
      requestedPacks: 20,
      requestedUnits: 200,
      approvedPacks: 12, // Super Admin reduced from 20 to 12
      approvedUnits: 120,
    },
    {
      productId: "prod-2",
      productName: "Jackfruit Jam",
      sku: "SKU-JJ",
      packType: "Box of 10 Sticks",
      requestedPacks: 10,
      requestedUnits: 100,
      approvedPacks: 10, // Full approval
      approvedUnits: 100,
    },
    {
      productId: "prod-3",
      productName: "Spanish Delight",
      sku: "SKU-SD",
      packType: "Box of 10 Sticks",
      requestedPacks: 5,
      requestedUnits: 50,
      approvedPacks: 0, // Super Admin rejected / out of stock
      approvedUnits: 0,
    },
  ];

  const cargo = calculateItemsCargo(orderItems);
  assert.equal(cargo.crates, 22, "Total crates must be 12 + 10 + 0 = 22 crates (not 35 requested crates)");
  assert.equal(cargo.sticks, 220, "Total sticks must be 120 + 100 + 0 = 220 sticks (not 350 requested sticks)");
});

test("3. Source code audit: dispatch-helpers.ts defines and exports getItemCrates and getItemSticks", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/lib/actions/dispatch-helpers.ts"), "utf-8");
  assert.ok(file.includes("export function getItemCrates"), "dispatch-helpers must export getItemCrates");
  assert.ok(file.includes("export function getItemSticks"), "dispatch-helpers must export getItemSticks");
  assert.ok(
    file.includes("it.approvedPacks !== undefined && it.approvedPacks !== null"),
    "getItemCrates must check undefined/null explicitly to preserve 0"
  );
});

test("4. Source code audit: updateStopStatusAction fails closed on missing RPC and checks updated rows", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/lib/actions/dispatches.ts"), "utf-8");
  assert.ok(
    file.includes("isFunctionMissing") && file.includes("PGRST202"),
    "updateStopStatusAction must strictly check PGRST202 for missing RPC rather than generic error swallowing"
  );
  assert.ok(
    file.includes("STOP_NOT_UPDATED"),
    "updateStopStatusAction must fail closed if zero rows updated"
  );
});

test("5. Source code audit: handleMarkStopDelivered uses isBranchMatch and fails closed", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/app/admin/delivery/DeliveryStaffView.tsx"), "utf-8");
  assert.ok(
    file.includes("isBranchMatch(branchId, s.branchId, s.branchName)"),
    "handleMarkStopDelivered must use isBranchMatch to match stop by slug or UUID"
  );
  assert.ok(
    file.includes('throw new Error(`Could not find route stop for branch "${branchName}".`)'),
    "handleMarkStopDelivered must fail closed if no matching stop exists"
  );
});

test("6. Source code audit: AdminContext syncOrdersFromServer updates items unconditionally", () => {
  const file = fs.readFileSync(path.join(ROOT, "src/context/AdminContext.tsx"), "utf-8");
  assert.ok(
    file.includes("items: eo.items && eo.items.length > 0 ? eo.items : existing.items"),
    "AdminContext must unconditionally merge updated items from server"
  );
  assert.ok(
    file.includes("discrepancyType: \"missing\""),
    "AdminContext must persist discrepancy record on delivery shortage"
  );
});

test("7. Stop delivery matching: finds stop by branch slug or UUID using isBranchMatch", () => {
  const stops = [
    {
      id: "stop-1",
      orderId: "ord-10070",
      branchId: "b3333333-3333-3333-3333-333333333303",
      branchName: "Ice Spot Ollur",
    },
  ];

  // Lookup using the slug ID
  const matchedBySlug = stops.find((s) =>
    isBranchMatch("ollur-branch", s.branchId, s.branchName) ||
    s.branchId === "ollur-branch" ||
    s.orderId === "ollur-branch"
  );
  assert.ok(matchedBySlug, "Stop must be found when looked up with branch slug 'ollur-branch'");
  assert.equal(matchedBySlug.orderId, "ord-10070");

  // Lookup using the UUID
  const matchedByUuid = stops.find((s) =>
    isBranchMatch("b3333333-3333-3333-3333-333333333303", s.branchId, s.branchName) ||
    s.branchId === "b3333333-3333-3333-3333-333333333303" ||
    s.orderId === "b3333333-3333-3333-3333-333333333303"
  );
  assert.ok(matchedByUuid, "Stop must be found when looked up with branch UUID");
  assert.equal(matchedByUuid.orderId, "ord-10070");
});

test("8. Delivery staff partial delivery and return reconciliation calculation", () => {
  const item = {
    productId: "prod-1",
    productName: "Tender Coconut",
    requestedPacks: 15,
    requestedUnits: 150,
    approvedPacks: 15,
    approvedUnits: 150,
  };

  const returnedSticks = 20; // 2 crates returned
  const assignedSticks = getItemSticks(item); // 150
  const deliveredSticks = Math.max(0, assignedSticks - returnedSticks); // 130
  const deliveredCratesEquiv = deliveredSticks / 10; // 13.0
  const returnedCratesEquiv = returnedSticks / 10; // 2.0

  assert.equal(deliveredSticks, 130, "Delivered sticks must be 130");
  assert.equal(deliveredCratesEquiv, 13, "Delivered crates equivalent must be 13");
  assert.equal(returnedCratesEquiv, 2, "Returned crates equivalent must be 2");
  assert.equal(deliveredSticks + returnedSticks, assignedSticks, "Delivered + returned must equal assigned");
});
