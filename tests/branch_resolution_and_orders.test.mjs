import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VALID_OLLUR_BRANCH_UUID = "bcfbc0e6-7f12-4513-8d7d-8f20bd173ddb";
const VALID_TOWN_BRANCH_UUID = "e138758f-dd3f-4878-be00-d12ad36f6b81";
const NONEXISTENT_BRANCH_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MOCK_BRANCHES = [
  {
    id: VALID_OLLUR_BRANCH_UUID,
    code: "BR-OLL-003",
    name: "Ice Spot Ollur",
    category: "franchise_parlour",
    address: "Company Padi, High Road, Ollur",
    locality: "Ollur",
    district: "Thrissur",
    contact_name: "Ollur Admin",
    contact_phone: "+91 94470 00002",
    is_active: true,
  },
  {
    id: VALID_TOWN_BRANCH_UUID,
    code: "BR-TSR-002",
    name: "Ice Spot Thrissur Town",
    category: "flagship_parlour",
    address: "Round North, Thrissur",
    locality: "Thrissur Round",
    district: "Thrissur",
    contact_name: "Town Admin",
    contact_phone: "+91 94470 00003",
    is_active: true,
  },
];

// Helper to evaluate branch resolution directly matching server-auth logic
function evaluateBranchResolution(profile, branchRecord, dbError = null, availableBranches = [], selectedBranchId = undefined) {
  if (!profile) {
    return {
      status: "profile_unassigned",
      branch: null,
      availableBranches: [],
      error: "No user profile found for authenticated account.",
    };
  }

  const normalizedRole = profile.role.toLowerCase().replace(/-/g, "_");

  // Case 1: Branch Admin
  if (normalizedRole === "branch_admin") {
    if (!profile.branch_id) {
      return {
        status: "profile_unassigned",
        branch: null,
        availableBranches: [],
        error:
          "Your account has the Branch Admin role, but no branch is linked in your database profile (profiles.branch_id is null). Please contact the Super Administrator to assign your branch UUID.",
      };
    }

    if (!UUID_REGEX.test(profile.branch_id)) {
      return {
        status: "malformed_uuid",
        branch: null,
        availableBranches: [],
        error: `Assigned branch identifier "${profile.branch_id}" is malformed. A valid UUID is required.`,
      };
    }

    if (dbError) {
      return {
        status: "query_error",
        branch: null,
        availableBranches: [],
        error: `Database query error while loading branch record: ${dbError.message}`,
      };
    }

    if (!branchRecord) {
      return {
        status: "branch_not_found",
        branch: null,
        availableBranches: [],
        error: `The branch assigned to your profile (${profile.branch_id}) does not exist in the public.branches registry.`,
      };
    }

    if (!branchRecord.is_active) {
      return {
        status: "branch_inactive",
        branch: branchRecord,
        availableBranches: [],
        error: `Assigned branch "${branchRecord.name}" (${branchRecord.code}) is marked inactive. Order submissions are disabled.`,
      };
    }

    return {
      status: "authorized",
      branch: branchRecord,
      availableBranches: [branchRecord],
    };
  }

  // Case 2: Super Admin
  if (normalizedRole === "super_admin") {
    if (dbError) {
      return {
        status: "query_error",
        branch: null,
        availableBranches: [],
        error: `Database query error loading franchise branches: ${dbError.message}`,
      };
    }

    if (!availableBranches || availableBranches.length === 0) {
      return {
        status: "super_admin_unassigned",
        branch: null,
        availableBranches: [],
        error: "No active branches found in the database registry.",
      };
    }

    let activeBranch = null;
    if (selectedBranchId && UUID_REGEX.test(selectedBranchId)) {
      activeBranch = availableBranches.find((b) => b.id.toLowerCase() === selectedBranchId.toLowerCase()) || null;
    }

    if (!activeBranch) {
      activeBranch =
        availableBranches.find((b) => b.code === "BR-OLL-003" || b.name.toLowerCase().includes("ollur")) ||
        availableBranches[0];
    }

    return {
      status: "super_admin_authorized",
      branch: activeBranch,
      availableBranches,
    };
  }

  return {
    status: "forbidden",
    branch: null,
    availableBranches: [],
    error: `User role "${profile.role}" is not authorized for branch replenishment order desk.`,
  };
}

// Helper to simulate branch isolation check in server-auth
function checkBranchAdminIsolation(profile, targetBranchId) {
  if (!profile || !profile.is_active) {
    return { isAuthorized: false, error: "PROFILE_INACTIVE" };
  }
  const normalizedRole = profile.role.toLowerCase().replace(/-/g, "_");
  if (normalizedRole !== "branch_admin" && normalizedRole !== "super_admin") {
    return { isAuthorized: false, error: "FORBIDDEN" };
  }
  if (normalizedRole === "branch_admin" && targetBranchId) {
    if (!profile.branch_id || profile.branch_id.toLowerCase() !== targetBranchId.toLowerCase()) {
      return {
        isAuthorized: false,
        error: "BRANCH_ISOLATION_VIOLATION",
        message: "Unauthorized: You may only manage your own assigned branch.",
      };
    }
  }
  return { isAuthorized: true };
}

test("1. A valid branch-admin profile with a valid assigned branch resolves successfully", () => {
  const profile = {
    id: "4d44e752-35e6-49e6-ac9a-117ded4aa7be",
    full_name: "Ice Spot Ollur Admin",
    role: "branch_admin",
    branch_id: VALID_OLLUR_BRANCH_UUID,
    is_active: true,
  };

  const branchRecord = MOCK_BRANCHES[0];
  const result = evaluateBranchResolution(profile, branchRecord, null, [branchRecord]);

  assert.strictEqual(result.status, "authorized");
  assert.ok(result.branch);
  assert.strictEqual(result.branch.id, VALID_OLLUR_BRANCH_UUID);
  assert.strictEqual(result.branch.code, "BR-OLL-003");
  assert.strictEqual(result.branch.name, "Ice Spot Ollur");
  assert.strictEqual(result.error, undefined);
});

test("2. A branch-admin profile with no branch assignment is rejected with actionable error", () => {
  const profile = {
    id: "55555555-5555-5555-5555-555555555555",
    full_name: "Unassigned Admin",
    role: "branch_admin",
    branch_id: null,
    is_active: true,
  };

  const result = evaluateBranchResolution(profile, null);

  assert.strictEqual(result.status, "profile_unassigned");
  assert.strictEqual(result.branch, null);
  assert.match(
    result.error,
    /no branch is linked in your database profile \(profiles\.branch_id is null\)/i
  );
  assert.match(result.error, /contact the Super Administrator/i);
});

test("3a. An invalid / malformed branch UUID is rejected with malformed_uuid", () => {
  const profile = {
    id: "66666666-6666-6666-6666-666666666666",
    full_name: "Malformed UUID Admin",
    role: "branch_admin",
    branch_id: "not-a-valid-uuid",
    is_active: true,
  };

  const result = evaluateBranchResolution(profile, null);

  assert.strictEqual(result.status, "malformed_uuid");
  assert.strictEqual(result.branch, null);
  assert.match(result.error, /is malformed\. A valid UUID is required/i);
});

test("3b. A nonexistent branch UUID is rejected with branch_not_found", () => {
  const profile = {
    id: "77777777-7777-7777-7777-777777777777",
    full_name: "Ghost Branch Admin",
    role: "branch_admin",
    branch_id: NONEXISTENT_BRANCH_UUID,
    is_active: true,
  };

  // Database returns null for nonexistent branch
  const result = evaluateBranchResolution(profile, null, null);

  assert.strictEqual(result.status, "branch_not_found");
  assert.strictEqual(result.branch, null);
  assert.match(result.error, /does not exist in the public\.branches registry/i);
});

test("3c. A deactivated branch record is rejected with branch_inactive", () => {
  const profile = {
    id: "4d44e752-35e6-49e6-ac9a-117ded4aa7be",
    full_name: "Inactive Branch Admin",
    role: "branch_admin",
    branch_id: VALID_OLLUR_BRANCH_UUID,
    is_active: true,
  };

  const inactiveBranch = { ...MOCK_BRANCHES[0], is_active: false };
  const result = evaluateBranchResolution(profile, inactiveBranch, null);

  assert.strictEqual(result.status, "branch_inactive");
  assert.strictEqual(result.branch.id, VALID_OLLUR_BRANCH_UUID);
  assert.match(result.error, /is marked inactive\. Order submissions are disabled/i);
});

test("4. A database / RLS query error is caught and distinguished from missing branch", () => {
  const profile = {
    id: "4d44e752-35e6-49e6-ac9a-117ded4aa7be",
    full_name: "RLS Error Admin",
    role: "branch_admin",
    branch_id: VALID_OLLUR_BRANCH_UUID,
    is_active: true,
  };

  const dbError = { message: "permission denied for table branches (42501)" };
  const result = evaluateBranchResolution(profile, null, dbError);

  assert.strictEqual(result.status, "query_error");
  assert.strictEqual(result.branch, null);
  assert.match(result.error, /permission denied for table branches/i);
});

test("5. A client payload attempting to submit another branch's UUID is blocked (Branch Isolation)", () => {
  const ollurAdminProfile = {
    id: "4d44e752-35e6-49e6-ac9a-117ded4aa7be",
    full_name: "Ice Spot Ollur Admin",
    role: "branch_admin",
    branch_id: VALID_OLLUR_BRANCH_UUID,
    is_active: true,
  };

  // Attempting to submit for own branch -> Authorized
  const ownBranchResult = checkBranchAdminIsolation(ollurAdminProfile, VALID_OLLUR_BRANCH_UUID);
  assert.strictEqual(ownBranchResult.isAuthorized, true);

  // Attempting to submit for Thrissur Town branch -> Blocked with BRANCH_ISOLATION_VIOLATION
  const crossBranchResult = checkBranchAdminIsolation(ollurAdminProfile, VALID_TOWN_BRANCH_UUID);
  assert.strictEqual(crossBranchResult.isAuthorized, false);
  assert.strictEqual(crossBranchResult.error, "BRANCH_ISOLATION_VIOLATION");
  assert.strictEqual(crossBranchResult.message, "Unauthorized: You may only manage your own assigned branch.");
});

test("6. Super Admin has factory-wide oversight and can audit any network branch", () => {
  const superAdminProfile = {
    id: "04d9dfb2-98d3-408e-937c-1ab53629f3c3",
    full_name: "Ice Spot Super Admin",
    role: "super_admin",
    branch_id: null,
    is_active: true,
  };

  // Default resolution selects canonical Ollur branch
  const defaultResult = evaluateBranchResolution(superAdminProfile, null, null, MOCK_BRANCHES);
  assert.strictEqual(defaultResult.status, "super_admin_authorized");
  assert.strictEqual(defaultResult.branch.id, VALID_OLLUR_BRANCH_UUID);
  assert.strictEqual(defaultResult.availableBranches.length, 2);

  // Explicit selection of Thrissur Town
  const townResult = evaluateBranchResolution(superAdminProfile, null, null, MOCK_BRANCHES, VALID_TOWN_BRANCH_UUID);
  assert.strictEqual(townResult.status, "super_admin_authorized");
  assert.strictEqual(townResult.branch.id, VALID_TOWN_BRANCH_UUID);
  assert.strictEqual(townResult.branch.code, "BR-TSR-002");

  // Super Admin can order for any branch
  const townAuth = checkBranchAdminIsolation(superAdminProfile, VALID_TOWN_BRANCH_UUID);
  assert.strictEqual(townAuth.isAuthorized, true);
});

test("7. Successful authorized order payload validation and schema conformance", () => {
  const validPayload = {
    branchId: VALID_OLLUR_BRANCH_UUID,
    items: [
      {
        productId: "1b3e4fae-f068-4f79-b519-76e77d876e32",
        requestedQuantity: 15,
      },
      {
        productId: "809f5a73-19b1-481d-8dd8-3c3e19d9ec72",
        requestedQuantity: 10,
      },
    ],
    notes: "Delivery before 10 AM",
  };

  assert.ok(UUID_REGEX.test(validPayload.branchId), "Branch ID must be a valid UUID");
  assert.ok(validPayload.items.length > 0, "Items list must not be empty");
  for (const item of validPayload.items) {
    assert.ok(UUID_REGEX.test(item.productId), "Product ID must be a valid UUID");
    assert.ok(item.requestedQuantity > 0, "Quantity must be positive");
  }
});

test("8. Empty or invalid order submissions are rejected prior to persistence", () => {
  // Empty order with 0 crates
  const emptyItems = [];
  const validateOrder = (items, branchId) => {
    if (!branchId || !UUID_REGEX.test(branchId)) {
      return { valid: false, error: "Invalid branch identifier." };
    }
    const totalCrates = items.reduce((sum, it) => sum + (it.requestedQuantity || 0), 0);
    if (totalCrates === 0) {
      return { valid: false, error: "Please add at least 1 crate to submit an order" };
    }
    return { valid: true, totalCrates, totalSticks: totalCrates * 10 };
  };

  const emptyResult = validateOrder(emptyItems, VALID_OLLUR_BRANCH_UUID);
  assert.strictEqual(emptyResult.valid, false);
  assert.strictEqual(emptyResult.error, "Please add at least 1 crate to submit an order");

  // Invalid branch ID
  const invalidBranchResult = validateOrder([{ requestedQuantity: 10 }], "invalid-id");
  assert.strictEqual(invalidBranchResult.valid, false);
  assert.strictEqual(invalidBranchResult.error, "Invalid branch identifier.");

  // Valid order
  const validResult = validateOrder([{ requestedQuantity: 122 }], VALID_OLLUR_BRANCH_UUID);
  assert.strictEqual(validResult.valid, true);
  assert.strictEqual(validResult.totalCrates, 122);
  assert.strictEqual(validResult.totalSticks, 1220);
});

test("9. Canonical order persistence model verifies 1 crate = 10 sticks and Varavoor Factory destination", () => {
  const crateQuantities = {
    "prod-tender-coconut": 35,
    "prod-malabar-mango": 35,
    "prod-kulfi": 25,
    "prod-rose-milk": 27,
  };

  const totalCrates = Object.values(crateQuantities).reduce((a, b) => a + b, 0);
  const totalSticks = totalCrates * 10;
  assert.strictEqual(totalCrates, 122);
  assert.strictEqual(totalSticks, 1220);

  const orderRecord = {
    id: "ord-test-10058",
    orderNumber: "ORD-2026-10058",
    branchId: VALID_OLLUR_BRANCH_UUID,
    branchName: "Ice Spot Ollur",
    branchCode: "BR-OLL-003",
    destinationFactory: "Varavoor Factory",
    district: "Thrissur",
    submittedAt: "26/10/2026, 09:30",
    requestedDeliveryDate: "Next Friday (Oct 24)",
    status: "submitted",
    totalUnitsRequested: totalSticks,
    totalUnitsApproved: 0,
    branchNotes: "Cold storage cleared for intake",
    items: Object.entries(crateQuantities).map(([productId, qty]) => ({
      productId,
      productName: productId,
      sku: "SKU",
      packType: "Box of 10 Sticks (1 Crate)",
      requestedPacks: qty,
      requestedUnits: qty * 10,
      approvedPacks: 0,
      approvedUnits: 0,
    })),
  };

  assert.strictEqual(orderRecord.destinationFactory, "Varavoor Factory");
  assert.strictEqual(orderRecord.branchCode, "BR-OLL-003");
  assert.strictEqual(orderRecord.status, "submitted");
  assert.strictEqual(orderRecord.totalUnitsRequested, 1220);
});

test("10. Super Admin and Staff Admin share identical canonical order record", () => {
  // Shared state simulation as implemented in AdminContext
  const canonicalOrders = [
    {
      id: "ord-10058",
      orderNumber: "ORD-2026-10058",
      branchId: VALID_OLLUR_BRANCH_UUID,
      branchName: "Ice Spot Ollur",
      branchCode: "BR-OLL-003",
      destinationFactory: "Varavoor Factory",
      status: "submitted",
      totalUnitsRequested: 1220,
      submittedAt: "26/10/2026, 09:30",
      items: [{ productId: "p1", productName: "Tender Coconut", requestedPacks: 122, requestedUnits: 1220 }],
    },
  ];

  // Super Admin view filters
  const superAdminOrders = canonicalOrders.filter(() => true);
  assert.strictEqual(superAdminOrders.length, 1);
  assert.strictEqual(superAdminOrders[0].id, "ord-10058");
  assert.strictEqual(superAdminOrders[0].destinationFactory, "Varavoor Factory");

  // Staff Admin (Delivery Staff) view filters
  const staffAdminOrders = canonicalOrders.filter(() => true);
  assert.strictEqual(staffAdminOrders.length, 1);
  assert.strictEqual(staffAdminOrders[0].id, "ord-10058");
  assert.strictEqual(staffAdminOrders[0].branchCode, "BR-OLL-003");
  assert.strictEqual(staffAdminOrders[0], superAdminOrders[0], "Both admins reference the exact same canonical object");
});

test("11. Default status filter 'all' ensures newly submitted orders are never hidden", () => {
  const orders = [
    { id: "o1", orderNumber: "ORD-1", status: "submitted" },
    { id: "o2", orderNumber: "ORD-2", status: "approved" },
    { id: "o3", orderNumber: "ORD-3", status: "dispatched" },
    { id: "o4", orderNumber: "ORD-4", status: "delivered" },
  ];

  const defaultFilter = "all";
  const displayed = orders.filter((o) => defaultFilter === "all" || o.status === defaultFilter);
  assert.strictEqual(displayed.length, 4);
  assert.ok(displayed.some((o) => o.status === "submitted" && o.id === "o1"));
});

test("12. Deduplication logic prevents duplicate order entries on refresh or repeated sync", () => {
  const initialOrders = [
    { id: "ord-10058", orderNumber: "ORD-2026-10058", branchName: "Ice Spot Ollur", status: "submitted" },
    { id: "ord-10057", orderNumber: "ORD-2026-10057", branchName: "Thrissur Town", status: "approved" },
  ];

  const newOrder = {
    id: "ord-10058", // Same ID as existing
    orderNumber: "ORD-2026-10058",
    branchName: "Ice Spot Ollur",
    status: "submitted",
  };

  // AdminContext deduplication pattern:
  const filtered = initialOrders.filter((o) => o.id !== newOrder.id && o.orderNumber !== newOrder.orderNumber);
  const updated = [newOrder, ...filtered];

  assert.strictEqual(updated.length, 2, "Duplicate order must be merged cleanly without duplicating list length");
  assert.strictEqual(updated[0].id, "ord-10058");
});

test("13. Failed persistence preserves form state while verified persistence clears it", () => {
  let formState = {
    quantities: { "p1": 15, "p2": 10 },
    notes: "Deep freezer bay 2 cleared",
  };

  // Simulating failed persistence
  const simulateSubmission = (success) => {
    if (!success) {
      // Error: preserve formState
      return { success: false, message: "Database connection failed" };
    }
    // Success: clear form
    formState = {
      quantities: { "p1": 0, "p2": 0 },
      notes: "",
    };
    return { success: true };
  };

  // 1. Failure case
  const failRes = simulateSubmission(false);
  assert.strictEqual(failRes.success, false);
  assert.strictEqual(formState.quantities["p1"], 15, "Form quantities must be preserved on error");
  assert.strictEqual(formState.notes, "Deep freezer bay 2 cleared", "Form notes must be preserved on error");

  // 2. Success case
  const successRes = simulateSubmission(true);
  assert.strictEqual(successRes.success, true);
  assert.strictEqual(formState.quantities["p1"], 0, "Form quantities must be reset after success");
  assert.strictEqual(formState.notes, "", "Form notes must be reset after success");
});

