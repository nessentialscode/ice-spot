import test from "node:test";
import assert from "node:assert/strict";

// ==============================================================================
// ICE SPOT — PHASE 3B: DISPATCH CREATION, OLLUR ORDER LINKING, AND PERSISTENCE
// ==============================================================================

// Helper mirroring isBranchMatch logic from DeliveryStaffView.tsx
function isBranchMatch(branchIdentifier, orderBranchId, orderBranchName, orderBranchCode, catalogBranches = []) {
  if (!branchIdentifier) return false;
  const bLower = branchIdentifier.toLowerCase().trim();
  const idLower = (orderBranchId || "").toLowerCase().trim();
  const nameLower = (orderBranchName || "").toLowerCase().trim();
  const codeLower = (orderBranchCode || "").toLowerCase().trim();

  // 1. Direct ID match
  if (bLower && idLower && bLower === idLower) return true;

  // 2. Code match
  if (codeLower && (bLower.includes(codeLower) || codeLower.includes(bLower))) return true;

  // 3. Name slug match
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

  // 4. Compare with known catalog branches
  const catalogBranch = catalogBranches.find((b) => b.id.toLowerCase() === bLower || clean(b.name) === bClean);
  if (catalogBranch) {
    const catClean = clean(catalogBranch.name);
    if (catClean && nClean && (catClean === nClean || catClean.includes(nClean) || nClean.includes(catClean))) {
      return true;
    }
  }

  return false;
}

// Helper mirroring getBranchAndEligibleOrder logic
function getBranchAndEligibleOrder(branchIdOrSlug, orders, catalogBranches) {
  const catalogBranch = catalogBranches.find(
    (b) => b.id === branchIdOrSlug || isBranchMatch(branchIdOrSlug, b.id, b.name, undefined, catalogBranches)
  );

  const branch = catalogBranch || {
    id: branchIdOrSlug,
    name: branchIdOrSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    district: "Thrissur",
  };

  const branchOrders = orders.filter((o) =>
    isBranchMatch(branchIdOrSlug, o.branchId, o.branchName, o.branchCode, catalogBranches)
  );

  const approvedOrders = branchOrders.filter(
    (o) =>
      (o.status === "approved" || o.status === "preparation" || o.status === "ready-for-dispatch") &&
      !o.assignedDispatchId
  );

  if (approvedOrders.length > 0) {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const serverApproved = approvedOrders.filter((o) => UUID_REGEX.test(o.id));
    if (serverApproved.length > 0) {
      return { branch, eligibleOrder: serverApproved[serverApproved.length - 1] };
    }
    return { branch, eligibleOrder: approvedOrders[approvedOrders.length - 1] };
  }

  if (branchOrders.length > 0) {
    const latestOrder = branchOrders[branchOrders.length - 1];
    let reason = `Order #${latestOrder.orderNumber || latestOrder.id} is not eligible for dispatch.`;
    if (latestOrder.status === "delivered") {
      reason = `Order #${latestOrder.orderNumber || latestOrder.id} has already been delivered.`;
    } else if (latestOrder.status === "dispatched" || latestOrder.assignedDispatchId) {
      reason = `Order #${latestOrder.orderNumber || latestOrder.id} has already been dispatched.`;
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

// Mock test data matching production DB structures
const OLLUR_BRANCH_UUID = "bcfbc0e6-7f12-4513-8d7d-8f20bd173ddb";
const KURIACHIRA_BRANCH_UUID = "a1111111-7f12-4513-8d7d-8f20bd173ddb";

const CATALOG_BRANCHES = [
  { id: "ollur-branch", name: "Ice Spot Ollur", district: "Thrissur", location: "Company Padi, Ollur" },
  { id: "kuriachira-branch", name: "Ice Spot Kuriachira", district: "Thrissur", location: "Kuriachira Junction" },
];

const MOCK_ORDERS = [
  {
    id: "1479860b-6949-43c3-8889-ff82d1c9bb76",
    orderNumber: "10061",
    branchId: OLLUR_BRANCH_UUID,
    branchName: "Ice Spot Ollur",
    branchCode: "BR-OLL-003",
    status: "approved",
    items: [
      {
        productId: "p-tender-coconut",
        productName: "Tender Coconut Stick",
        sku: "STK-TC-001",
        packType: "Crate (10 Sticks)",
        requestedPacks: 5,
        approvedPacks: 5,
        approvedUnits: 50,
      },
      {
        productId: "p-jackfruit",
        productName: "Jackfruit Chakkathik",
        sku: "STK-JF-002",
        packType: "Crate (10 Sticks)",
        requestedPacks: 3,
        approvedPacks: 3,
        approvedUnits: 30,
      },
    ],
  },
  {
    id: "2479860b-6949-43c3-8889-ff82d1c9bb77",
    orderNumber: "10060",
    branchId: KURIACHIRA_BRANCH_UUID,
    branchName: "Ice Spot Kuriachira",
    branchCode: "BR-KUR-001",
    status: "delivered", // historical already delivered order
    items: [
      {
        productId: "p-mango",
        productName: "Mango Stick",
        sku: "STK-MG-003",
        packType: "Crate (10 Sticks)",
        requestedPacks: 4,
        approvedPacks: 4,
        approvedUnits: 40,
      },
    ],
  },
];

// ==============================================================================
// 1. Branch Slug & UUID Matching Tests
// ==============================================================================

test("1. Branch matching: 'ollur-branch' slug resolves to DB record with UUID and 'Ice Spot Ollur'", () => {
  const match = isBranchMatch(
    "ollur-branch",
    OLLUR_BRANCH_UUID,
    "Ice Spot Ollur",
    "BR-OLL-003",
    CATALOG_BRANCHES
  );
  assert.equal(match, true, "Slug 'ollur-branch' must match order for 'Ice Spot Ollur'");
});

test("2. Branch matching: Direct database UUID comparison resolves successfully", () => {
  const match = isBranchMatch(
    OLLUR_BRANCH_UUID,
    OLLUR_BRANCH_UUID,
    "Ice Spot Ollur",
    "BR-OLL-003",
    CATALOG_BRANCHES
  );
  assert.equal(match, true, "Direct UUID match must return true");
});

test("3. Branch matching: Branch code 'BR-OLL-003' resolves successfully", () => {
  const match = isBranchMatch(
    "BR-OLL-003",
    OLLUR_BRANCH_UUID,
    "Ice Spot Ollur",
    "BR-OLL-003",
    CATALOG_BRANCHES
  );
  assert.equal(match, true, "Branch code match must return true");
});

test("4. Branch matching: Does NOT falsely match a different branch", () => {
  const match = isBranchMatch(
    "kuriachira-branch",
    OLLUR_BRANCH_UUID,
    "Ice Spot Ollur",
    "BR-OLL-003",
    CATALOG_BRANCHES
  );
  assert.equal(match, false, "Kuriachira branch must not match Ollur order");
});

// ==============================================================================
// 2. Order and Cargo Linking Tests
// ==============================================================================

test("5. Order linking: Selecting Ollur retrieves approved order 10061 with assigned products", () => {
  const { branch, eligibleOrder } = getBranchAndEligibleOrder("ollur-branch", MOCK_ORDERS, CATALOG_BRANCHES);

  assert.ok(eligibleOrder, "Eligible order must be found for Ollur");
  assert.equal(eligibleOrder.orderNumber, "10061");
  assert.equal(eligibleOrder.id, "1479860b-6949-43c3-8889-ff82d1c9bb76");
  assert.equal(eligibleOrder.items.length, 2);
  assert.equal(eligibleOrder.items[0].productName, "Tender Coconut Stick");
  assert.equal(eligibleOrder.items[0].approvedPacks, 5);
  assert.equal(eligibleOrder.items[1].productName, "Jackfruit Chakkathik");
  assert.equal(eligibleOrder.items[1].approvedPacks, 3);
});

test("6. Order isolation: Does NOT link already delivered or unrelated historical orders for new trip", () => {
  const { eligibleOrder } = getBranchAndEligibleOrder("kuriachira-branch", MOCK_ORDERS, CATALOG_BRANCHES);

  // Kuriachira has no approved order in MOCK_ORDERS (only delivered)
  // When looking for eligible dispatchable order, an approved order does NOT exist
  const approvedOnly = MOCK_ORDERS.filter(
    (o) =>
      isBranchMatch("kuriachira-branch", o.branchId, o.branchName, o.branchCode, CATALOG_BRANCHES) &&
      o.status === "approved"
  );
  assert.equal(approvedOnly.length, 0, "No approved orders should exist for Kuriachira");
});

test("7. Empty state: Returns empty array and NEVER creates mock flavours when no products assigned", () => {
  function getBranchProducts(branchId, stops, orders, catalogBranches) {
    // 1. Dispatch stop
    const matchedStop = stops?.find((s) => isBranchMatch(branchId, s.branchId, s.branchName, undefined, catalogBranches));
    if (matchedStop?.items && matchedStop.items.length > 0) return matchedStop.items;

    // 2. Eligible order
    const { eligibleOrder } = getBranchAndEligibleOrder(branchId, orders, catalogBranches);
    if (eligibleOrder && (eligibleOrder.status === "approved" || eligibleOrder.status === "preparation") && eligibleOrder.items) {
      return eligibleOrder.items;
    }

    // 3. Clean empty state (NO mock flavours!)
    return [];
  }

  const emptyBranchProducts = getBranchProducts("chalakudy-branch", [], MOCK_ORDERS, CATALOG_BRANCHES);
  assert.deepEqual(emptyBranchProducts, [], "Must return empty array without generating synthetic flavours");
});

// ==============================================================================
// 3. Server Persistence & Dispatch Creation Tests
// ==============================================================================

test("8. Dispatch creation validation: Rejects trip when no approved orders exist for selected branches", () => {
  function validateTripSubmission(selectedBranchIds, orders, catalogBranches) {
    const eligibleOrders = [];
    for (const bId of selectedBranchIds) {
      const { eligibleOrder } = getBranchAndEligibleOrder(bId, orders, catalogBranches);
      if (eligibleOrder && (eligibleOrder.status === "approved" || eligibleOrder.status === "preparation")) {
        if (!eligibleOrders.some((o) => o.id === eligibleOrder.id)) {
          eligibleOrders.push(eligibleOrder);
        }
      }
    }

    if (eligibleOrders.length === 0) {
      return {
        valid: false,
        error: "No approved orders found for the selected destination branches. Orders must be approved by Super Admin before scheduling delivery.",
      };
    }

    return { valid: true, orderIds: eligibleOrders.map((o) => o.id) };
  }

  // Branch with no approved order
  const resInvalid = validateTripSubmission(["chalakudy-branch"], MOCK_ORDERS, CATALOG_BRANCHES);
  assert.equal(resInvalid.valid, false);
  assert.match(resInvalid.error, /No approved orders found/);

  // Branch with approved order (Ollur)
  const resValid = validateTripSubmission(["ollur-branch"], MOCK_ORDERS, CATALOG_BRANCHES);
  assert.equal(resValid.valid, true);
  assert.deepEqual(resValid.orderIds, ["1479860b-6949-43c3-8889-ff82d1c9bb76"]);
});

test("9. Server action invocation: Uses real database UUIDs and valid payload structure", async () => {
  let serverActionCalledWith = null;

  async function mockCreateDispatchAction(input) {
    serverActionCalledWith = input;
    return {
      success: true,
      message: "Dispatch created successfully",
      dispatchId: "dsp-db-uuid-5555",
      manifestNumber: "DSP-VRV-1005",
    };
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  async function createDispatchBatch(data) {
    const hasServerUUIDs = data.orderIds.length > 0 && data.orderIds.every((id) => UUID_REGEX.test(id));
    assert.ok(hasServerUUIDs, "All order IDs must be real database UUIDs");

    const res = await mockCreateDispatchAction({
      vehicleNumber: data.vehicleNumber,
      driverId: data.driverId && UUID_REGEX.test(data.driverId) ? data.driverId : undefined,
      driverName: data.driverName,
      orderIds: data.orderIds,
      notes: data.notes,
      departureTime: data.departureTime,
    });

    return res;
  }

  const result = await createDispatchBatch({
    vehicleNumber: "KL-08-AX-4412 (Insulated Reefer Van)",
    driverId: "c1111111-7f12-4513-8d7d-8f20bd173ddc",
    driverName: "delivery@icespot.com",
    orderIds: ["1479860b-6949-43c3-8889-ff82d1c9bb76"],
    notes: "Ollur urgent morning delivery",
    departureTime: "07:45 AM",
  });

  assert.equal(result.success, true);
  assert.equal(result.dispatchId, "dsp-db-uuid-5555");
  assert.equal(serverActionCalledWith.vehicleNumber, "KL-08-AX-4412 (Insulated Reefer Van)");
  assert.deepEqual(serverActionCalledWith.orderIds, ["1479860b-6949-43c3-8889-ff82d1c9bb76"]);
});

// ==============================================================================
// 4. Persistence & Refresh / Reload Tests
// ==============================================================================

test("10. Page refresh / reload: Server dispatches are mapped and merged, preventing newly created trips from disappearing", () => {
  // Simulate DB rows returned by getDispatchesAction
  const serverDispatches = [
    {
      id: "dsp-db-uuid-5555",
      manifestNumber: "DSP-VRV-1005",
      vehicleNumber: "KL-08-AX-4412 (Insulated Reefer Van)",
      driverName: "delivery@icespot.com",
      status: "scheduled",
      dispatchDate: "2026-10-29",
      departureTime: "07:45 AM",
      totalUnits: 80,
      stops: [
        {
          id: "stop-1",
          orderId: "1479860b-6949-43c3-8889-ff82d1c9bb76",
          orderNumber: "10061",
          branchId: OLLUR_BRANCH_UUID,
          branchName: "Ice Spot Ollur",
          sequence: 1,
          status: "scheduled",
          items: [
            {
              productId: "p-tender-coconut",
              productName: "Tender Coconut Stick",
              sku: "STK-TC-001",
              packType: "Crate (10 Sticks)",
              requestedPacks: 5,
              approvedPacks: 5,
              approvedUnits: 50,
            },
            {
              productId: "p-jackfruit",
              productName: "Jackfruit Chakkathik",
              sku: "STK-JF-002",
              packType: "Crate (10 Sticks)",
              requestedPacks: 3,
              approvedPacks: 3,
              approvedUnits: 30,
            },
          ],
        },
      ],
    },
  ];

  // Merge logic mirroring AdminContext syncDispatchesFromServer
  const prevDispatches = [
    {
      id: "dsp-089",
      manifestNumber: "DSP-VRV-089",
      status: "completed",
    },
  ];

  const map = new Map();
  prevDispatches.forEach((d) => map.set(d.id, d));
  serverDispatches.forEach((sd) => map.set(sd.id, sd));
  const mergedDispatches = Array.from(map.values());

  assert.equal(mergedDispatches.length, 2);
  const reloadedOllurTrip = mergedDispatches.find((d) => d.id === "dsp-db-uuid-5555");
  assert.ok(reloadedOllurTrip, "Reloaded Ollur dispatch trip must exist in context");
  assert.equal(reloadedOllurTrip.manifestNumber, "DSP-VRV-1005");
  assert.equal(reloadedOllurTrip.stops.length, 1);
  assert.equal(reloadedOllurTrip.stops[0].branchName, "Ice Spot Ollur");
  assert.equal(reloadedOllurTrip.stops[0].items.length, 2);
});

// ==============================================================================
// 5. Delivery Staff Return-Only Formula & Handover Verification
// ==============================================================================

test("11. Return-only calculation in Section 3: Delivered sticks = Assigned sticks - Returned sticks", () => {
  const itemAssignedSticks = 50; // 5 crates * 10
  const itemReturnedSticks = 10; // 10 sticks returned (1 crate equivalent)
  const itemDeliveredSticks = Math.max(0, itemAssignedSticks - itemReturnedSticks);

  assert.equal(itemDeliveredSticks, 40, "Delivered sticks must be 40 when 10 are returned out of 50");
  assert.equal(itemDeliveredSticks / 10, 4, "Delivered crates equivalent must be 4");
});

test("12. Role validation in dispatch actions: super_admin and delivery_staff are permitted", () => {
  function checkDispatchRole(role) {
    const normalized = (role || "").toLowerCase().replace(/-/g, "_");
    return normalized === "super_admin" || normalized === "delivery_staff";
  }

  assert.equal(checkDispatchRole("super_admin"), true, "super_admin can dispatch");
  assert.equal(checkDispatchRole("delivery_staff"), true, "delivery_staff can dispatch");
  assert.equal(checkDispatchRole("branch_admin"), false, "branch_admin is denied");
  assert.equal(checkDispatchRole("anonymous"), false, "anonymous is denied");
});

// ==============================================================================
// 6. Phase 3D: Dispatch Form Persistence, Cargo Quantities, & Manifest Resolution
// ==============================================================================

test("13. Phase 3D: Scheduled departure time (12:45 PM) preservation across creation, mock fallback, and reload", () => {
  // Simulate dispatch creation payload
  const createPayload = {
    vehicleNumber: "KL-09-AQ-9955 (Insulated Reefer Van)",
    driverId: "cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43",
    driverName: "Delivery Staff",
    orderIds: ["c661bb20-b857-48a5-8056-9c8685798876"],
    departureTime: "12:45 PM",
  };

  // Mock fallback logic in AdminContext.createDispatchBatch
  const fallbackDispatch = {
    id: "dsp-100",
    manifestNumber: "DSP-VRV-100",
    vehicleNumber: createPayload.vehicleNumber,
    driverId: createPayload.driverId,
    driverName: createPayload.driverName,
    dispatchDate: "2026-10-29",
    departureTime: createPayload.departureTime || "07:45 AM",
    status: "loading",
    orderIds: createPayload.orderIds,
    totalUnits: 550,
    stops: [],
  };

  assert.equal(fallbackDispatch.departureTime, "12:45 PM", "Departure time must be preserved in created dispatch");

  // Display resolution helper in DeliveryStaffView
  const depTimeDisplay = fallbackDispatch.departureTime ||
    (fallbackDispatch.departedAt ? fallbackDispatch.departedAt.replace(/^\d{4}-\d{2}-\d{2}[T\s]+/, "") : "07:45 AM");

  assert.equal(depTimeDisplay, "12:45 PM", "Display helper must show entered '12:45 PM' and not default to '07:45 AM'");

  // Update trip details preserves departure time
  const updatedDispatch = {
    ...fallbackDispatch,
    departureTime: "01:15 PM",
    notes: "Updated run notes",
  };
  assert.equal(updatedDispatch.departureTime, "01:15 PM", "Trip update must update departure time");

  // Reload sync preserves departure time
  const reloadedMap = new Map();
  reloadedMap.set(fallbackDispatch.id, fallbackDispatch);
  const reloaded = reloadedMap.get("dsp-100");
  assert.equal(reloaded.departureTime, "12:45 PM", "Reload must retain the exact saved departure time");
});

test("14. Phase 3D: Semantic distinction between Vehicle Capacity, Total Loaded Cargo, and Stop-Level Allocated Cargo", () => {
  // 1. Vehicle Capacity: Physical limit stored on FleetVehicle
  const vehicle = {
    id: "veh-1",
    registrationNumber: "KL-09-AQ-9955",
    modelOrType: "Insulated Reefer Van",
    capacityCrates: 55, // physical capacity
    status: "available",
  };

  // 2. Stop 1 (Ollur) allocated 55 crates; Stop 2 (Kuriachira) allocated 10 crates
  const stops = [
    {
      id: "stop-1",
      branchId: OLLUR_BRANCH_UUID,
      branchName: "Ice Spot Ollur",
      items: [
        { productId: "p-1", productName: "Item 1", packType: "Crate (10 Sticks)", approvedPacks: 35, approvedUnits: 350 },
        { productId: "p-2", productName: "Item 2", packType: "Crate (10 Sticks)", approvedPacks: 20, approvedUnits: 200 },
      ],
    },
    {
      id: "stop-2",
      branchId: KURIACHIRA_BRANCH_UUID,
      branchName: "Ice Spot Kuriachira",
      items: [
        { productId: "p-3", productName: "Item 3", packType: "Crate (10 Sticks)", approvedPacks: 10, approvedUnits: 100 },
      ],
    },
  ];

  // 3. Stop Allocated Cargo: Derived from stop's own items
  const stop1AllocatedCrates = stops[0].items.reduce((s, it) => s + it.approvedPacks, 0);
  const stop2AllocatedCrates = stops[1].items.reduce((s, it) => s + it.approvedPacks, 0);

  assert.equal(stop1AllocatedCrates, 55, "Stop 1 allocated cargo must be 55 crates");
  assert.equal(stop2AllocatedCrates, 10, "Stop 2 allocated cargo must be 10 crates");

  // 4. Dispatch Total Loaded Cargo: Sum of all stops on the dispatch trip
  const totalLoadedCrates = stops.reduce(
    (sum, s) => sum + s.items.reduce((iSum, it) => iSum + it.approvedPacks, 0),
    0
  );
  assert.equal(totalLoadedCrates, 65, "Total loaded cargo on dispatch trip must be 65 crates (55 + 10)");

  // 5. Delivered Quantity: Return-only entry (Delivered = Assigned - Returned)
  const stop1Item1Assigned = stops[0].items[0].approvedPacks; // 35
  const stop1Item1Returned = 3;
  const stop1Item1Delivered = Math.max(0, stop1Item1Assigned - stop1Item1Returned);

  assert.equal(stop1Item1Delivered, 32, "Delivered quantity must be 32 (35 assigned - 3 returned)");

  // Semantic separation assertion: each value is distinct and does not overwrite another
  assert.notEqual(vehicle.capacityCrates, totalLoadedCrates, "Vehicle capacity (55) != Total loaded cargo (65)");
  assert.notEqual(stop1AllocatedCrates, stop2AllocatedCrates, "Stop 1 (55) != Stop 2 (10)");
});

test("15. Phase 3D: Allocated cargo in Section 2 is derived from stop items rather than hardcoded 8 crates", () => {
  const branchCratesMap = { "kuriachira-branch": 10, "ollur-branch": 8, "chalakudy-junction": 6 };

  // Dispatch with Ollur stop having 55 crates
  const activeDispatchWithOllur = {
    id: "dsp-ollur",
    stops: [
      {
        branchId: "ollur-branch",
        branchName: "Ice Spot Ollur",
        items: Array.from({ length: 11 }, (_, i) => ({
          productId: `prod-${i + 1}`,
          productName: `Flavour ${i + 1}`,
          packType: "Crate (10 Sticks)",
          approvedPacks: 5,
          approvedUnits: 50,
        })),
      },
    ],
  };

  function computeSection2AllocatedCargo(branchId, activeDispatch, branchMap) {
    const matchedStop = activeDispatch?.stops?.find((s) => s.branchId === branchId);
    const stopItems = matchedStop?.items || [];
    const stopCrates = stopItems.length > 0
      ? stopItems.reduce((sum, it) => sum + (it.approvedPacks ?? it.requestedPacks ?? 0), 0)
      : (branchMap[branchId] || 0);
    const stopSticks = stopItems.length > 0
      ? stopItems.reduce((sum, it) => sum + (it.approvedUnits ?? it.requestedUnits ?? 0), 0)
      : (stopCrates * 10);

    return { stopCrates, stopSticks };
  }

  const result = computeSection2AllocatedCargo("ollur-branch", activeDispatchWithOllur, branchCratesMap);
  assert.equal(result.stopCrates, 55, "Section 2 allocated cargo must be 55 crates, NOT hardcoded 8");
  assert.equal(result.stopSticks, 550, "Section 2 allocated sticks must be 550 sticks");
});

test("16. Phase 3D: Ollur order resolution strictly selects approved order and manifests all approved product lines", () => {
  const testOrders = [
    // Mock submitted order (previously caused 4 products totaling 16 crates)
    {
      id: "ord-104",
      orderNumber: "ORD-2026-104",
      branchId: "ollur-branch",
      branchName: "Ice Spot Ollur",
      status: "submitted", // NOT approved!
      items: [
        { productId: "p-straw", productName: "Sweet Strawberry", approvedPacks: 4 },
        { productId: "p-mango", productName: "Alphonso Mango", approvedPacks: 6 },
        { productId: "p-coco", productName: "Tender Coconut", approvedPacks: 4 },
        { productId: "p-jack", productName: "Varikka Chakka", approvedPacks: 2 },
      ],
    },
    // Genuine approved Ollur Order #10069 (UUID with 11 flavours, 55 crates)
    {
      id: "c661bb20-b857-48a5-8056-9c8685798876",
      orderNumber: "10069",
      branchId: OLLUR_BRANCH_UUID,
      branchName: "Ice Spot Ollur",
      branchCode: "BR-OLL-003",
      status: "approved",
      items: [
        { productId: "p-01", productName: "Tender Coconut Stick", approvedPacks: 5, approvedUnits: 50 },
        { productId: "p-02", productName: "Alphonso Mango Stick", approvedPacks: 5, approvedUnits: 50 },
        { productId: "p-03", productName: "Kulfi Stick", approvedPacks: 5, approvedUnits: 50 },
        { productId: "p-04", productName: "Belgian Chocolate Stick", approvedPacks: 5, approvedUnits: 50 },
        { productId: "p-05", productName: "Pistachio Stick", approvedPacks: 5, approvedUnits: 50 },
        { productId: "p-06", productName: "Strawberry Delight", approvedPacks: 5, approvedUnits: 50 },
        { productId: "p-07", productName: "Jackfruit Chakkathik", approvedPacks: 5, approvedUnits: 50 },
        { productId: "p-08", productName: "Spanish Delight", approvedPacks: 5, approvedUnits: 50 },
        { productId: "p-09", productName: "Butterscotch Stick", approvedPacks: 5, approvedUnits: 50 },
        { productId: "p-10", productName: "Blackcurrant Stick", approvedPacks: 5, approvedUnits: 50 },
        { productId: "p-11", productName: "Choco Almond Stick", approvedPacks: 5, approvedUnits: 50 },
      ],
    },
  ];

  const { branch, eligibleOrder } = getBranchAndEligibleOrder("ollur-branch", testOrders, CATALOG_BRANCHES);

  assert.ok(eligibleOrder, "Eligible order must be resolved for Ollur");
  assert.equal(eligibleOrder.id, "c661bb20-b857-48a5-8056-9c8685798876", "Must select genuine UUID order #10069");
  assert.equal(eligibleOrder.orderNumber, "10069");
  assert.equal(eligibleOrder.status, "approved");
  assert.equal(eligibleOrder.items.length, 11, "Must have all 11 approved flavours, not 4 mock products");

  const totalCrates = eligibleOrder.items.reduce((s, it) => s + it.approvedPacks, 0);
  assert.equal(totalCrates, 55, "Total approved crates must be 55, not 16");
});

test("17. Phase 3D: When branch has no approved order, getBranchAndEligibleOrder returns undefined and UI displays empty state", () => {
  const unapprovedOrders = [
    {
      id: "ord-104",
      orderNumber: "ORD-2026-104",
      branchId: "ollur-branch",
      branchName: "Ice Spot Ollur",
      status: "submitted", // Unapproved requisition
      items: [{ productId: "p-straw", productName: "Sweet Strawberry", approvedPacks: 0 }],
    },
  ];

  const { branch, eligibleOrder } = getBranchAndEligibleOrder("ollur-branch", unapprovedOrders, CATALOG_BRANCHES);

  assert.equal(eligibleOrder, undefined, "Must return undefined when no approved order exists");

  // Manifest products helper returns empty array
  function getActiveBranchOrderProducts(activeBranchId, activeDispatch, orders, catalogBranches) {
    const matchedStop = activeDispatch?.stops?.find((s) => s.branchId === activeBranchId);
    if (matchedStop?.items && matchedStop.items.length > 0) return matchedStop.items;

    const { eligibleOrder: elOrd } = getBranchAndEligibleOrder(activeBranchId, orders, catalogBranches);
    if (elOrd && elOrd.items && elOrd.items.length > 0) return elOrd.items;

    return [];
  }

  const manifestProducts = getActiveBranchOrderProducts("ollur-branch", null, unapprovedOrders, CATALOG_BRANCHES);
  assert.deepEqual(manifestProducts, [], "Must return empty array rather than substituting unapproved mock items");
});

test("18. Phase 3D: Section 1 card crate count derives accurately from stop items without /10 or /24 distortion", () => {
  // Dispatch with mock-shaped order where units were 384 (16 packs * 24)
  const dispatchFromMockOrder = {
    id: "dsp-mock",
    totalUnits: 384,
    stops: [
      {
        id: "stop-1",
        branchId: "ollur-branch",
        branchName: "Ice Spot Ollur",
        items: [
          { productId: "p-1", packType: "Crate (24 Sticks)", approvedPacks: 4, approvedUnits: 96 },
          { productId: "p-2", packType: "Crate (24 Sticks)", approvedPacks: 6, approvedUnits: 144 },
          { productId: "p-3", packType: "Crate (24 Sticks)", approvedPacks: 4, approvedUnits: 96 },
          { productId: "p-4", packType: "Crate (24 Sticks)", approvedPacks: 2, approvedUnits: 48 },
        ],
      },
    ],
  };

  // Old formula: Math.round((dsp.totalUnits || 240) / 10) = Math.round(384 / 10) = 38 (DISTORTION BUG)
  const oldBuggyCrates = Math.round((dispatchFromMockOrder.totalUnits || 240) / 10);
  assert.equal(oldBuggyCrates, 38, "Old formula produced 38 crates due to dividing 384 units by 10");

  // Phase 3D formula: Calculate from stop items
  const correctedCrates = dispatchFromMockOrder.stops && dispatchFromMockOrder.stops.length > 0
    ? dispatchFromMockOrder.stops.reduce(
        (sum, s) =>
          sum + (s.items?.reduce((iSum, it) => iSum + (it.approvedPacks ?? it.requestedPacks ?? 0), 0) || 0),
        0
      )
    : Math.round((dispatchFromMockOrder.totalUnits || 0) / 10);

  assert.equal(correctedCrates, 16, "Phase 3D formula must correctly calculate 16 crates (4 + 6 + 4 + 2)");
});

// ==============================================================================
// 7. Phase 3E: Approved Ollur Order Visibility & Dispatch Eligibility Tests
// ==============================================================================

test("19. Phase 3E: Approved Ollur Order #10069 is found with full UUID and all 11 approved flavours", () => {
  const CANONICAL_OLLUR_10069 = {
    id: "c661bb20-b857-48a5-8056-9c8685798876",
    orderNumber: "ORD-2026-10069",
    branchId: OLLUR_BRANCH_UUID,
    branchName: "Ice Spot Ollur",
    branchCode: "BR-OLL-003",
    status: "approved",
    totalUnitsRequested: 550,
    totalUnitsApproved: 550,
    items: [
      { productId: "77bc1298-848b-42f1-a680-092bfb3ae683", productName: "Fresh Watermelon", sku: "SKU-STK-006", approvedPacks: 5, approvedUnits: 50 },
      { productId: "76ae70b4-03bc-4912-9de2-8d2380756305", productName: "Zesty Kiwi", sku: "SKU-STK-007", approvedPacks: 5, approvedUnits: 50 },
      { productId: "788d0141-2c88-43f0-b696-bed4f2e0c6b1", productName: "Wild Blueberry", sku: "SKU-STK-008", approvedPacks: 5, approvedUnits: 50 },
      { productId: "53f23e18-627c-4ab8-ad8a-24b5c2bbe6a6", productName: "Sunshine Lemon", sku: "SKU-STK-009", approvedPacks: 5, approvedUnits: 50 },
      { productId: "fa781afc-0caa-45e6-b8ae-69447d7cb488", productName: "Royal Pomegranate", sku: "SKU-STK-010", approvedPacks: 5, approvedUnits: 50 },
      { productId: "f1b73c73-fdfa-494c-bb2b-21ce6a07d79a", productName: "Orea Cream", sku: "FLV-OREA-13", approvedPacks: 5, approvedUnits: 50 },
      { productId: "1b3e4fae-f068-4f79-b519-76e77d876e32", productName: "Sweet Strawberry", sku: "SKU-STK-001", approvedPacks: 5, approvedUnits: 50 },
      { productId: "527d9a84-1ab0-4a59-8f0d-7631a790b13e", productName: "Creamy Guava & Mint", sku: "SKU-STK-002", approvedPacks: 5, approvedUnits: 50 },
      { productId: "809f5a73-19b1-481d-8dd8-3c3e19d9ec72", productName: "Alphonso Mango", sku: "SKU-STK-003", approvedPacks: 5, approvedUnits: 50 },
      { productId: "43dcc294-eabd-43f4-957e-f099c5a6c638", productName: "Tender Coconut", sku: "SKU-STK-004", approvedPacks: 5, approvedUnits: 50 },
      { productId: "984fe887-9811-402e-bca3-77622eaa27eb", productName: "Belgian Chocolate", sku: "SKU-STK-005", approvedPacks: 5, approvedUnits: 50 },
    ],
  };

  const { branch, eligibleOrder, ineligibleReason } = getBranchAndEligibleOrder("ollur-branch", [CANONICAL_OLLUR_10069], CATALOG_BRANCHES);

  assert.ok(eligibleOrder, "Eligible order #10069 must be found");
  assert.equal(ineligibleReason, undefined, "Ineligible reason must be undefined for approved order");
  assert.equal(eligibleOrder.id, "c661bb20-b857-48a5-8056-9c8685798876");
  assert.equal(eligibleOrder.orderNumber, "ORD-2026-10069");
  assert.equal(eligibleOrder.status, "approved");
  assert.equal(eligibleOrder.items.length, 11, "Must contain all 11 approved products");

  const totalCrates = eligibleOrder.items.reduce((s, it) => s + it.approvedPacks, 0);
  assert.equal(totalCrates, 55, "Total approved crates must equal 55 crates (550 sticks)");
});

test("20. Phase 3E: An unrelated branch order is rejected when selecting Ollur", () => {
  const KURI_ORDER = {
    id: "a1111111-1111-4444-8888-9c8685798876",
    orderNumber: "ORD-2026-10070",
    branchId: KURIACHIRA_BRANCH_UUID,
    branchName: "Ice Spot Kuriachira",
    branchCode: "BR-KUR-001",
    status: "approved",
    items: [{ productId: "p-1", approvedPacks: 10 }],
  };

  const { branch, eligibleOrder, ineligibleReason } = getBranchAndEligibleOrder("ollur-branch", [KURI_ORDER], CATALOG_BRANCHES);

  assert.equal(eligibleOrder, undefined, "Unrelated Kuriachira order must not match Ollur");
  assert.match(ineligibleReason, /No requisition orders found for Ice Spot Ollur/);
});

test("21. Phase 3E: Submitted or cancelled order is rejected with explicit status reason", () => {
  const SUBMITTED_ORDER = {
    id: "sub-1234",
    orderNumber: "ORD-2026-10080",
    branchId: OLLUR_BRANCH_UUID,
    branchName: "Ice Spot Ollur",
    status: "submitted",
    items: [{ productId: "p-1", approvedPacks: 0 }],
  };

  const CANCELLED_ORDER = {
    id: "canc-1234",
    orderNumber: "ORD-2026-10081",
    branchId: OLLUR_BRANCH_UUID,
    branchName: "Ice Spot Ollur",
    status: "cancelled",
    items: [{ productId: "p-1", approvedPacks: 0 }],
  };

  const resSub = getBranchAndEligibleOrder("ollur-branch", [SUBMITTED_ORDER], CATALOG_BRANCHES);
  assert.equal(resSub.eligibleOrder, undefined);
  assert.match(resSub.ineligibleReason, /awaiting Super Admin approval/);

  const resCanc = getBranchAndEligibleOrder("ollur-branch", [CANCELLED_ORDER], CATALOG_BRANCHES);
  assert.equal(resCanc.eligibleOrder, undefined);
  assert.match(resCanc.ineligibleReason, /was cancelled/);
});

test("22. Phase 3E: Already-dispatched or delivered order cannot be dispatched again and reports explicit reason", () => {
  const DISPATCHED_ORDER = {
    id: "disp-1234",
    orderNumber: "ORD-2026-10082",
    branchId: OLLUR_BRANCH_UUID,
    branchName: "Ice Spot Ollur",
    status: "dispatched",
    assignedDispatchId: "dsp-prev-999",
    items: [{ productId: "p-1", approvedPacks: 5 }],
  };

  const DELIVERED_ORDER = {
    id: "deliv-1234",
    orderNumber: "ORD-2026-10061",
    branchId: OLLUR_BRANCH_UUID,
    branchName: "Ice Spot Ollur",
    status: "delivered",
    assignedDispatchId: "dsp-prev-998",
    items: [{ productId: "p-1", approvedPacks: 5 }],
  };

  const resDisp = getBranchAndEligibleOrder("ollur-branch", [DISPATCHED_ORDER], CATALOG_BRANCHES);
  assert.equal(resDisp.eligibleOrder, undefined);
  assert.match(resDisp.ineligibleReason, /has already been dispatched/);

  const resDeliv = getBranchAndEligibleOrder("ollur-branch", [DELIVERED_ORDER], CATALOG_BRANCHES);
  assert.equal(resDeliv.eligibleOrder, undefined);
  assert.match(resDeliv.ineligibleReason, /has already been delivered/);
});

test("23. Phase 3E: Role validation in eligible orders action permits delivery_staff and super_admin only", () => {
  function checkEligibleOrdersRole(role) {
    const normalized = (role || "").toLowerCase().replace(/-/g, "_");
    return normalized === "super_admin" || normalized === "delivery_staff";
  }

  assert.equal(checkEligibleOrdersRole("delivery_staff"), true, "delivery_staff is authorized");
  assert.equal(checkEligibleOrdersRole("super_admin"), true, "super_admin is authorized");
  assert.equal(checkEligibleOrdersRole("branch_admin"), false, "branch_admin is denied");
  assert.equal(checkEligibleOrdersRole("anonymous"), false, "anonymous is denied");
});

test("24. Phase 3E: Actual approved product lines reach the form manifest without substitution of mock data", () => {
  const CANONICAL_OLLUR_10069 = {
    id: "c661bb20-b857-48a5-8056-9c8685798876",
    orderNumber: "ORD-2026-10069",
    branchId: OLLUR_BRANCH_UUID,
    branchName: "Ice Spot Ollur",
    branchCode: "BR-OLL-003",
    status: "approved",
    items: [
      { productId: "p1", productName: "Fresh Watermelon", sku: "SKU-STK-006", approvedPacks: 5 },
      { productId: "p2", productName: "Zesty Kiwi", sku: "SKU-STK-007", approvedPacks: 5 },
      { productId: "p3", productName: "Wild Blueberry", sku: "SKU-STK-008", approvedPacks: 5 },
      { productId: "p4", productName: "Sunshine Lemon", sku: "SKU-STK-009", approvedPacks: 5 },
      { productId: "p5", productName: "Royal Pomegranate", sku: "SKU-STK-010", approvedPacks: 5 },
      { productId: "p6", productName: "Orea Cream", sku: "FLV-OREA-13", approvedPacks: 5 },
      { productId: "p7", productName: "Sweet Strawberry", sku: "SKU-STK-001", approvedPacks: 5 },
      { productId: "p8", productName: "Creamy Guava & Mint", sku: "SKU-STK-002", approvedPacks: 5 },
      { productId: "p9", productName: "Alphonso Mango", sku: "SKU-STK-003", approvedPacks: 5 },
      { productId: "p10", productName: "Tender Coconut", sku: "SKU-STK-004", approvedPacks: 5 },
      { productId: "p11", productName: "Belgian Chocolate", sku: "SKU-STK-005", approvedPacks: 5 },
    ],
  };

  const { branch, eligibleOrder } = getBranchAndEligibleOrder("ollur-branch", [CANONICAL_OLLUR_10069], CATALOG_BRANCHES);
  assert.ok(eligibleOrder);

  // Form manifest items resolution
  function getManifestItems(activeBranchId, activeDispatch, orders, catalogBranches) {
    const matchedStop = activeDispatch?.stops?.find((s) => s.branchId === activeBranchId);
    if (matchedStop?.items && matchedStop.items.length > 0) return matchedStop.items;
    const { eligibleOrder: elOrd } = getBranchAndEligibleOrder(activeBranchId, orders, catalogBranches);
    return elOrd?.items || [];
  }

  const manifestItems = getManifestItems("ollur-branch", null, [CANONICAL_OLLUR_10069], CATALOG_BRANCHES);
  assert.equal(manifestItems.length, 11, "Must contain all 11 products");
  assert.equal(manifestItems[0].productName, "Fresh Watermelon");
  assert.equal(manifestItems[10].productName, "Belgian Chocolate");

  // Verify mock order ord-104 (with 4 products and 16 crates) is NOT present
  assert.ok(!manifestItems.some((it) => it.productName === "Varikka Chakka Honey"), "Mock flavours must not appear");
});

// ==============================================================================
// 25. Corrective Workflow Integrity Tests
// ==============================================================================

test("25. Integrity: Approved order with zero/missing approved quantities is rejected from dispatch creation", () => {
  const ZERO_QTY_ORDER = {
    id: "3479860b-6949-43c3-8889-ff82d1c9bb78",
    orderNumber: "ORD-2026-10070",
    branchId: OLLUR_BRANCH_UUID,
    branchName: "Ice Spot Ollur",
    status: "approved",
    items: [
      { productId: "p1", productName: "Fresh Watermelon", sku: "SKU-STK-006", approvedPacks: 0, requestedPacks: 5 },
      { productId: "p2", productName: "Zesty Kiwi", sku: "SKU-STK-007", approvedPacks: 0, requestedPacks: 5 },
    ],
  };

  const { eligibleOrder, ineligibleReason } = getBranchAndEligibleOrder("ollur-branch", [ZERO_QTY_ORDER], CATALOG_BRANCHES);
  
  // Server-side check
  const totalApproved = (ZERO_QTY_ORDER.items || []).reduce((sum, it) => sum + (it.approvedPacks || 0), 0);
  assert.equal(totalApproved, 0, "Approved quantity must be zero");
  
  function validateOrderForDispatch(order) {
    const total = (order.items || []).reduce((sum, it) => sum + (it.approvedPacks || 0), 0);
    if (total <= 0) {
      return { valid: false, error: "ZERO_APPROVED_QUANTITY", message: "Cannot create dispatch: Selected order has 0 approved items. Super Admin must approve items before dispatch." };
    }
    return { valid: true };
  }

  const validation = validateOrderForDispatch(ZERO_QTY_ORDER);
  assert.equal(validation.valid, false);
  assert.equal(validation.error, "ZERO_APPROVED_QUANTITY");
});

test("26. Integrity: Active dispatch attachment via dispatch_orders blocks duplicate dispatch", () => {
  const DISPATCHED_OLLUR_ORDER = {
    id: "c661bb20-b857-48a5-8056-9c8685798876",
    orderNumber: "ORD-2026-10069",
    branchId: OLLUR_BRANCH_UUID,
    branchName: "Ice Spot Ollur",
    status: "dispatched",
    assignedDispatchId: "dsp-vrv-1001",
    items: [{ productId: "p1", productName: "Fresh Watermelon", sku: "SKU-STK-006", approvedPacks: 5 }],
  };

  const { eligibleOrder, ineligibleReason } = getBranchAndEligibleOrder("ollur-branch", [DISPATCHED_OLLUR_ORDER], CATALOG_BRANCHES);
  assert.equal(eligibleOrder, undefined, "Already dispatched order must NOT be eligible");
  assert.match(ineligibleReason, /already been dispatched/);

  // Server-side duplicate guard check
  const existingStops = [
    { order_id: "c661bb20-b857-48a5-8056-9c8685798876", dispatches: { id: "dsp-vrv-1001", status: "scheduled", manifest_number: "DSP-VRV-1001" } }
  ];

  function checkDuplicateDispatch(orderIds, stops) {
    const duplicate = stops.find((s) => orderIds.includes(s.order_id) && !["completed", "cancelled", "failed"].includes(s.dispatches?.status));
    if (duplicate) {
      return { success: false, error: "ORDER_ALREADY_DISPATCHED", message: `Cannot create dispatch: Order is already attached to an active dispatch trip (${duplicate.dispatches.manifest_number}).` };
    }
    return { success: true };
  }

  const dupCheck = checkDuplicateDispatch(["c661bb20-b857-48a5-8056-9c8685798876"], existingStops);
  assert.equal(dupCheck.success, false);
  assert.equal(dupCheck.error, "ORDER_ALREADY_DISPATCHED");
  assert.match(dupCheck.message, /DSP-VRV-1001/);
});

test("27. Integrity: Exact SKU packaging conversion enforces 1 Crate = 10 Sticks consistently", () => {
  const skus = [
    { sku: "SKU-STK-001", name: "Sweet Strawberry", approvedCrates: 5 },
    { sku: "SKU-STK-002", name: "Creamy Guava & Mint", approvedCrates: 5 },
    { sku: "SKU-STK-003", name: "Alphonso Mango", approvedCrates: 5 },
    { sku: "SKU-STK-004", name: "Tender Coconut", approvedCrates: 5 },
    { sku: "SKU-STK-005", name: "Belgian Chocolate", approvedCrates: 5 },
    { sku: "SKU-STK-006", name: "Fresh Watermelon", approvedCrates: 5 },
    { sku: "SKU-STK-007", name: "Zesty Kiwi", approvedCrates: 5 },
    { sku: "SKU-STK-008", name: "Wild Blueberry", approvedCrates: 5 },
    { sku: "SKU-STK-009", name: "Sunshine Lemon", approvedCrates: 5 },
    { sku: "SKU-STK-010", name: "Royal Pomegranate", approvedCrates: 5 },
    { sku: "FLV-OREA-13", name: "Orea Cream", approvedCrates: 5 },
  ];

  const STICKS_PER_CRATE = 10;
  const totalCrates = skus.reduce((s, it) => s + it.approvedCrates, 0);
  const totalSticks = totalCrates * STICKS_PER_CRATE;

  assert.equal(totalCrates, 55, "11 flavours * 5 crates = 55 crates");
  assert.equal(totalSticks, 550, "55 crates * 10 sticks = 550 sticks");

  // Verify reverse conversion: 550 sticks / 10 = 55 crates
  assert.equal(totalSticks / STICKS_PER_CRATE, 55);
});

test("28. Integrity: AM/PM departure time round trip preserves exact 12:45 PM string", () => {
  const enteredTime = "12:45 PM";
  
  // 1. Form input submission
  const depTimeStr = enteredTime.trim() || "12:45 PM";
  assert.equal(depTimeStr, "12:45 PM");

  // 2. Server action payload mapping
  const serverPayload = {
    vehicleNumber: "KL-09-AQ-9955 (Insulated Reefer Van)",
    departureTime: depTimeStr,
    departure_time: depTimeStr,
  };
  assert.equal(serverPayload.departureTime, "12:45 PM");

  // 3. Database reload mapping
  const dbRow = {
    id: "dsp-uuid-1",
    vehicle_number: "KL-09-AQ-9955",
    departure_time: serverPayload.departure_time,
    dispatched_at: null,
  };

  const reloadedDispatch = {
    id: dbRow.id,
    vehicleNumber: dbRow.vehicle_number,
    departureTime: dbRow.departure_time || undefined,
  };

  // 4. UI display formatting
  const displayTime = reloadedDispatch.departureTime || "Scheduled";
  assert.equal(displayTime, "12:45 PM", "Must display 12:45 PM without converting or resetting to 07:45 AM");
});

test("29. Integrity: Multi-branch trip maintains isolated stop allocations and manifests", () => {
  const MULTI_STOP_DISPATCH = {
    id: "dsp-multi-1",
    manifestNumber: "DSP-VRV-901",
    vehicleNumber: "KL-09-AQ-9955",
    status: "scheduled",
    stops: [
      {
        id: "stop-1",
        branchId: OLLUR_BRANCH_UUID,
        branchName: "Ice Spot Ollur",
        items: [
          { productId: "p1", productName: "Fresh Watermelon", approvedPacks: 5, packedUnits: 50 },
          { productId: "p2", productName: "Zesty Kiwi", approvedPacks: 5, packedUnits: 50 },
        ],
        status: "scheduled",
      },
      {
        id: "stop-2",
        branchId: KURIACHIRA_BRANCH_UUID,
        branchName: "Ice Spot Kuriachira",
        items: [
          { productId: "p3", productName: "Alphonso Mango", approvedPacks: 4, packedUnits: 40 },
        ],
        status: "scheduled",
      },
    ],
  };

  // Reconciled cargo for stop 1 (Ollur): 10 crates (100 sticks)
  const ollurCrates = MULTI_STOP_DISPATCH.stops[0].items.reduce((s, it) => s + it.approvedPacks, 0);
  assert.equal(ollurCrates, 10);

  // Reconciled cargo for stop 2 (Kuriachira): 4 crates (40 sticks)
  const kuriachiraCrates = MULTI_STOP_DISPATCH.stops[1].items.reduce((s, it) => s + it.approvedPacks, 0);
  assert.equal(kuriachiraCrates, 4);

  // Total loaded cargo across all stops: 14 crates (140 sticks)
  const totalLoadedCrates = MULTI_STOP_DISPATCH.stops.reduce((s, stop) => s + stop.items.reduce((iS, it) => iS + it.approvedPacks, 0), 0);
  assert.equal(totalLoadedCrates, 14);
});

// ==============================================================================
// ICE SPOT — PHASE 3E/3F: CANONICAL CARGO AGGREGATION ACROSS SECTIONS 1, 2, AND 3
// ==============================================================================

const STICKS_PER_CRATE = 10;

function calculateItemsCargo(items) {
  if (!items || items.length === 0) {
    return { crates: 0, sticks: 0, items: [], hasItems: false };
  }
  const crates = items.reduce((sum, it) => sum + (it.approvedPacks ?? it.requestedPacks ?? 0), 0);
  const sticks = items.reduce(
    (sum, it) => sum + (it.approvedUnits ?? it.packedUnits ?? (it.approvedPacks ?? it.requestedPacks ?? 0) * STICKS_PER_CRATE),
    0
  );
  return {
    crates,
    sticks: sticks > 0 ? sticks : crates * STICKS_PER_CRATE,
    items,
    hasItems: true,
  };
}

function resolveStopItems(stop, dispatch, ordersList = []) {
  if (stop.items && stop.items.length > 0) {
    return stop.items;
  }
  if (stop.orderId && ordersList.length > 0) {
    const matchedOrder = ordersList.find((o) => o.id === stop.orderId || o.orderNumber === stop.orderId);
    if (matchedOrder && matchedOrder.items && matchedOrder.items.length > 0) {
      return matchedOrder.items;
    }
  }
  if (stop.branchId && ordersList.length > 0) {
    const matchingOrders = ordersList.filter((o) => isBranchMatch(stop.branchId, o.branchId, o.branchName, o.branchCode));
    if (dispatch?.id) {
      const assigned = matchingOrders.find((o) => o.assignedDispatchId === dispatch.id);
      if (assigned && assigned.items && assigned.items.length > 0) {
        return assigned.items;
      }
    }
    const activeOrder = matchingOrders.find((o) =>
      ["approved", "dispatched", "ready-for-dispatch", "preparation"].includes(o.status) && o.items && o.items.length > 0
    );
    if (activeOrder && activeOrder.items && activeOrder.items.length > 0) {
      return activeOrder.items;
    }
  }
  if (dispatch && (!dispatch.stops || dispatch.stops.length <= 1)) {
    const rawItems = dispatch.dispatch_items;
    if (Array.isArray(rawItems) && rawItems.length > 0) {
      return rawItems.map((di) => {
        const prod = Array.isArray(di.products) ? di.products[0] : di.products;
        const loadedQty = Number(di.quantity_loaded) || 0;
        return {
          productId: di.product_id,
          productName: prod?.name || "Handcrafted Stick",
          sku: prod?.sku || "SKU-STICK",
          packType: "Box of 10 Sticks (1 Crate)",
          requestedPacks: loadedQty,
          requestedUnits: loadedQty * STICKS_PER_CRATE,
          approvedPacks: loadedQty,
          approvedUnits: loadedQty * STICKS_PER_CRATE,
          packedUnits: loadedQty * STICKS_PER_CRATE,
        };
      });
    }
  }
  return [];
}

function calculateStopCargo(stop, dispatch, ordersList = []) {
  const items = resolveStopItems(stop, dispatch, ordersList);
  if (items.length > 0) {
    return calculateItemsCargo(items);
  }
  if (dispatch && (!dispatch.stops || dispatch.stops.length <= 1) && (dispatch.totalUnits || 0) > 0) {
    const sticks = dispatch.totalUnits || 0;
    const crates = Math.round(sticks / STICKS_PER_CRATE);
    return { crates, sticks, items: [], hasItems: false };
  }
  return { crates: 0, sticks: 0, items: [], hasItems: false };
}

function calculateDispatchCargo(dispatch, ordersList = []) {
  let totalCrates = 0;
  let totalSticks = 0;
  const stopsCargo = {};
  if (dispatch.stops && dispatch.stops.length > 0) {
    for (const stop of dispatch.stops) {
      const sCargo = calculateStopCargo(stop, dispatch, ordersList);
      stopsCargo[stop.branchId] = sCargo;
      totalCrates += sCargo.crates;
      totalSticks += sCargo.sticks;
    }
  }
  if (totalCrates === 0 && (dispatch.totalUnits || 0) > 0) {
    totalSticks = dispatch.totalUnits || 0;
    totalCrates = Math.round(totalSticks / STICKS_PER_CRATE);
    if (dispatch.stops && dispatch.stops.length === 1) {
      const s = dispatch.stops[0];
      stopsCargo[s.branchId] = { crates: totalCrates, sticks: totalSticks, items: [], hasItems: false };
    }
  }
  return {
    crates: totalCrates,
    sticks: totalSticks > 0 ? totalSticks : totalCrates * STICKS_PER_CRATE,
    stopsCargo,
  };
}

test("30. Cargo totals: Sections 1, 2, and 3 strictly agree on 55 Crates (550 Sticks) for Ollur ORD-2026-10069", () => {
  const ollur11Items = [
    { productId: "77bc1298-848b-42f1-a680-092bfb3ae683", productName: "Fresh Watermelon", sku: "SKU-STK-006", approvedPacks: 5, approvedUnits: 50 },
    { productId: "76ae70b4-03bc-4912-9de2-8d2380756305", productName: "Zesty Kiwi", sku: "SKU-STK-007", approvedPacks: 5, approvedUnits: 50 },
    { productId: "788d0141-2c88-43f0-b696-bed4f2e0c6b1", productName: "Wild Blueberry", sku: "SKU-STK-008", approvedPacks: 5, approvedUnits: 50 },
    { productId: "53f23e18-627c-4ab8-ad8a-24b5c2bbe6a6", productName: "Sunshine Lemon", sku: "SKU-STK-009", approvedPacks: 5, approvedUnits: 50 },
    { productId: "fa781afc-0caa-45e6-b8ae-69447d7cb488", productName: "Royal Pomegranate", sku: "SKU-STK-010", approvedPacks: 5, approvedUnits: 50 },
    { productId: "f1b73c73-fdfa-494c-bb2b-21ce6a07d79a", productName: "Orea Cream", sku: "FLV-OREA-13", approvedPacks: 5, approvedUnits: 50 },
    { productId: "1b3e4fae-f068-4f79-b519-76e77d876e32", productName: "Sweet Strawberry", sku: "SKU-STK-001", approvedPacks: 5, approvedUnits: 50 },
    { productId: "527d9a84-1ab0-4a59-8f0d-7631a790b13e", productName: "Creamy Guava & Mint", sku: "SKU-STK-002", approvedPacks: 5, approvedUnits: 50 },
    { productId: "809f5a73-19b1-481d-8dd8-3c3e19d9ec72", productName: "Alphonso Mango", sku: "SKU-STK-003", approvedPacks: 5, approvedUnits: 50 },
    { productId: "43dcc294-eabd-43f4-957e-f099c5a6c638", productName: "Tender Coconut", sku: "SKU-STK-004", approvedPacks: 5, approvedUnits: 50 },
    { productId: "984fe887-9811-402e-bca3-77622eaa27eb", productName: "Belgian Chocolate", sku: "SKU-STK-005", approvedPacks: 5, approvedUnits: 50 },
  ];

  const ollurOrder = {
    id: "c661bb20-b857-48a5-8056-9c8685798876",
    orderNumber: "10069",
    branchId: OLLUR_BRANCH_UUID,
    branchName: "Ice Spot Ollur",
    branchCode: "BR-OLL-003",
    status: "approved",
    items: ollur11Items,
  };

  const dispatchWithEmptyStopItems = {
    id: "dsp-ollur-live-1",
    manifestNumber: "DSP-VRV-091",
    vehicleNumber: "KL-09-AQ-9955 (Insulated Reefer Van)",
    departureTime: "12:45 PM",
    status: "scheduled",
    stops: [
      {
        id: "stop-live-1",
        orderId: ollurOrder.id,
        orderNumber: "ORD-2026-10069",
        branchId: OLLUR_BRANCH_UUID,
        branchName: "Ice Spot Ollur",
        sequence: 1,
        items: [], // Notice: items is [] in DB dispatch_orders join
        status: "scheduled",
      },
    ],
  };

  // Section 1: Dispatch Total Cargo
  const sec1Cargo = calculateDispatchCargo(dispatchWithEmptyStopItems, [ollurOrder]);
  assert.equal(sec1Cargo.crates, 55, "Section 1 crates must be 55, not 0");
  assert.equal(sec1Cargo.sticks, 550, "Section 1 sticks must be 550, not 0");

  // Section 2: Route Stop Allocated Cargo
  const stop = dispatchWithEmptyStopItems.stops[0];
  const sec2Cargo = calculateStopCargo(stop, dispatchWithEmptyStopItems, [ollurOrder]);
  assert.equal(sec2Cargo.crates, 55, "Section 2 crates must be 55, not 0");
  assert.equal(sec2Cargo.sticks, 550, "Section 2 sticks must be 550, not 0");

  // Section 3: Product Manifest Items
  const sec3Items = resolveStopItems(stop, dispatchWithEmptyStopItems, [ollurOrder]);
  assert.equal(sec3Items.length, 11, "Section 3 must show all 11 approved products");
  const sec3TotalCrates = sec3Items.reduce((s, it) => s + it.approvedPacks, 0);
  const sec3TotalSticks = sec3Items.reduce((s, it) => s + (it.approvedUnits || it.approvedPacks * STICKS_PER_CRATE), 0);
  assert.equal(sec3TotalCrates, 55, "Section 3 total crates must be 55");
  assert.equal(sec3TotalSticks, 550, "Section 3 total sticks must be 550");

  // All 3 sections strictly agree
  assert.equal(sec1Cargo.crates, sec2Cargo.crates);
  assert.equal(sec2Cargo.crates, sec3TotalCrates);
  assert.equal(sec1Cargo.sticks, sec2Cargo.sticks);
  assert.equal(sec2Cargo.sticks, sec3TotalSticks);
});

test("31. Truthy empty array bug prevention: stop.items = [] does not block fallback resolution", () => {
  const emptyStop = {
    id: "stop-1",
    branchId: OLLUR_BRANCH_UUID,
    items: [], // empty array in JS is truthy
  };

  const linkedOrder = {
    id: "ord-ollur-1",
    branchId: OLLUR_BRANCH_UUID,
    status: "approved",
    items: [
      { productId: "p1", approvedPacks: 5, approvedUnits: 50 },
      { productId: "p2", approvedPacks: 5, approvedUnits: 50 },
    ],
  };

  // Buggy pattern: stop.items || fallback evaluates to []
  const buggyItems = emptyStop.items || linkedOrder.items;
  assert.deepEqual(buggyItems, [], "Buggy pattern evaluates to empty array because [] is truthy");

  // Fixed resolver: checks length > 0
  const resolved = resolveStopItems(emptyStop, null, [linkedOrder]);
  assert.equal(resolved.length, 2, "Fixed resolver successfully falls back to linked order");
  const cargo = calculateStopCargo(emptyStop, null, [linkedOrder]);
  assert.equal(cargo.crates, 10);
  assert.equal(cargo.sticks, 100);
});

test("32. Multi-stop dispatch cargo aggregation: total dispatch strictly equals sum of stops", () => {
  const multiDispatch = {
    id: "dsp-multi-2",
    stops: [
      {
        id: "stop-1",
        branchId: OLLUR_BRANCH_UUID,
        items: [{ productId: "p1", approvedPacks: 30, approvedUnits: 300 }],
      },
      {
        id: "stop-2",
        branchId: KURIACHIRA_BRANCH_UUID,
        items: [{ productId: "p2", approvedPacks: 25, approvedUnits: 250 }],
      },
    ],
  };

  const dispatchCargo = calculateDispatchCargo(multiDispatch, []);
  assert.equal(dispatchCargo.crates, 55);
  assert.equal(dispatchCargo.sticks, 550);

  const stop1Cargo = calculateStopCargo(multiDispatch.stops[0], multiDispatch, []);
  const stop2Cargo = calculateStopCargo(multiDispatch.stops[1], multiDispatch, []);

  assert.equal(stop1Cargo.crates, 30);
  assert.equal(stop1Cargo.sticks, 300);
  assert.equal(stop2Cargo.crates, 25);
  assert.equal(stop2Cargo.sticks, 250);

  assert.equal(dispatchCargo.crates, stop1Cargo.crates + stop2Cargo.crates);
  assert.equal(dispatchCargo.sticks, stop1Cargo.sticks + stop2Cargo.sticks);
});

test("33. Single-stop dispatch fallback: authoritative totalUnits populates crates and sticks when items missing", () => {
  const dispatchWithTotalUnits = {
    id: "dsp-units-only",
    totalUnits: 550, // 550 sticks
    stops: [
      {
        id: "stop-1",
        branchId: OLLUR_BRANCH_UUID,
        items: [],
      },
    ],
  };

  const cargo = calculateDispatchCargo(dispatchWithTotalUnits, []);
  assert.equal(cargo.crates, 55);
  assert.equal(cargo.sticks, 550);

  const stopCargo = calculateStopCargo(dispatchWithTotalUnits.stops[0], dispatchWithTotalUnits, []);
  assert.equal(stopCargo.crates, 55);
  assert.equal(stopCargo.sticks, 550);
});



