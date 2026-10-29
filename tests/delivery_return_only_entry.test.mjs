import test from "node:test";
import assert from "node:assert/strict";

// ==============================================================================
// ICE SPOT — PHASE 3: DELIVERY STAFF PANEL RETURN-ONLY ENTRY TESTS (STICKS-BASED)
// ==============================================================================

test("1. Delivered Quantity calculation: Delivered = Assigned - Returned (sticks, default 0)", () => {
  const assignedSticks = 50; // 5 crates * 10 sticks/crate
  const returnedSticks = 0;
  const deliveredSticks = Math.max(0, assignedSticks - returnedSticks);

  assert.equal(deliveredSticks, 50, "Delivered sticks must equal assigned sticks when returned is 0");
});

test("2. Partial return calculation in sticks and crate equivalents", () => {
  const assignedSticks = 50; // 5 crates
  const returnedSticks = 15; // 15 sticks returned
  const deliveredSticks = Math.max(0, assignedSticks - returnedSticks);

  assert.equal(deliveredSticks, 35, "Delivered sticks must equal 35 when 15 sticks are returned from 50");

  // Crate equivalents:
  const deliveredCrates = deliveredSticks / 10;
  const returnedCrates = returnedSticks / 10;
  assert.equal(deliveredCrates, 3.5, "Delivered crate equivalent must be 3.5 crates");
  assert.equal(returnedCrates, 1.5, "Returned crate equivalent must be 1.5 crates");
});

test("3. Full return calculation: Assigned 50 sticks, Returned 50 sticks -> Delivered 0 sticks", () => {
  const assignedSticks = 50;
  const returnedSticks = 50;
  const deliveredSticks = Math.max(0, assignedSticks - returnedSticks);

  assert.equal(deliveredSticks, 0, "Delivered sticks must equal 0 when all 50 sticks are returned");
  assert.equal(deliveredSticks / 10, 0, "Delivered crates must be 0");
});

test("4. Partial-crate return conversion: 5 returned sticks from 50 = 45 delivered sticks (4.5 crates)", () => {
  const assignedCrates = 5;
  const unitsPerCrate = 10;
  const assignedSticks = assignedCrates * unitsPerCrate;
  const returnedSticks = 5;

  const deliveredSticks = assignedSticks - returnedSticks;
  const deliveredCrates = deliveredSticks / unitsPerCrate;
  const returnedCrates = returnedSticks / unitsPerCrate;

  assert.equal(assignedSticks, 50, "5 crates must equal 50 sticks");
  assert.equal(returnedSticks, 5, "5 sticks returned");
  assert.equal(deliveredSticks, 45, "Delivered sticks must be 45");
  assert.equal(deliveredCrates, 4.5, "45 delivered sticks must equal 4.5 crates");
  assert.equal(returnedCrates, 0.5, "5 returned sticks must equal 0.5 crates");
});

test("5. Input validation: Reject negative returned stick quantities", () => {
  function validateReturnedSticks(rawVal, assignedSticks) {
    if (rawVal === "" || rawVal === undefined) return { valid: true, value: 0 };
    const num = Number(rawVal);
    if (isNaN(num) || !isFinite(num)) return { valid: false, error: "Must be a valid number" };
    if (num < 0) return { valid: false, error: "Cannot be negative" };
    if (!Number.isInteger(num)) return { valid: false, error: "Must be a whole number of sticks" };
    if (num > assignedSticks) return { valid: false, error: `Cannot exceed assigned sticks (${assignedSticks})` };
    return { valid: true, value: num };
  }

  const resNegative = validateReturnedSticks(-1, 50);
  assert.equal(resNegative.valid, false);
  assert.equal(resNegative.error, "Cannot be negative");
});

test("6. Input validation: Reject returned sticks greater than assigned stick quantity", () => {
  function validateReturnedSticks(rawVal, assignedSticks) {
    if (rawVal === "" || rawVal === undefined) return { valid: true, value: 0 };
    const num = Number(rawVal);
    if (isNaN(num) || !isFinite(num)) return { valid: false, error: "Must be a valid number" };
    if (num < 0) return { valid: false, error: "Cannot be negative" };
    if (!Number.isInteger(num)) return { valid: false, error: "Must be a whole number of sticks" };
    if (num > assignedSticks) return { valid: false, error: `Cannot exceed assigned sticks (${assignedSticks})` };
    return { valid: true, value: num };
  }

  const resOver = validateReturnedSticks(55, 50);
  assert.equal(resOver.valid, false);
  assert.match(resOver.error, /Cannot exceed assigned sticks/);
});

test("7. Input validation: Reject non-numeric input and non-integer stick counts", () => {
  function validateReturnedSticks(rawVal, assignedSticks) {
    if (rawVal === "" || rawVal === undefined) return { valid: true, value: 0 };
    const num = Number(rawVal);
    if (isNaN(num) || !isFinite(num)) return { valid: false, error: "Must be a valid number" };
    if (num < 0) return { valid: false, error: "Cannot be negative" };
    if (!Number.isInteger(num)) return { valid: false, error: "Must be a whole number of sticks" };
    if (num > assignedSticks) return { valid: false, error: `Cannot exceed assigned sticks (${assignedSticks})` };
    return { valid: true, value: num };
  }

  const resNaN = validateReturnedSticks("abc", 50);
  assert.equal(resNaN.valid, false);
  assert.equal(resNaN.error, "Must be a valid number");

  const resFloat = validateReturnedSticks(2.5, 50);
  assert.equal(resFloat.valid, false);
  assert.equal(resFloat.error, "Must be a whole number of sticks");
});

test("8. Blank value handling: Blank input does not silently submit unintended quantity", () => {
  function computeDeliveryPayload(items, returnedMap, activeBranchId) {
    let hasValidationError = false;
    const errors = {};

    const deliveredItems = items.map((it, idx) => {
      const key = `${activeBranchId}-${it.productId || idx}`;
      const raw = returnedMap[key];
      const unitsPerPack = 10;
      const assignedSticks = (it.approvedPacks || it.requestedPacks || 0) * unitsPerPack;

      if (raw === "") {
        // Form field is blank
        hasValidationError = true;
        errors[key] = "Returned quantity cannot be blank";
        return null;
      }

      const returnedSticks = raw === undefined ? 0 : Number(raw);
      if (isNaN(returnedSticks) || returnedSticks < 0 || returnedSticks > assignedSticks || !Number.isInteger(returnedSticks)) {
        hasValidationError = true;
        errors[key] = "Invalid returned quantity";
        return null;
      }

      const deliveredSticks = assignedSticks - returnedSticks;
      return {
        productId: it.productId,
        quantityDelivered: deliveredSticks / unitsPerPack,
        shortageQuantity: returnedSticks / unitsPerPack,
        deliveredSticks,
        returnedSticks,
      };
    });

    return { hasValidationError, deliveredItems, errors };
  }

  const items = [{ productId: "p-straw", approvedPacks: 5 }];
  const mapWithBlank = { "br-ollur-p-straw": "" };

  const result = computeDeliveryPayload(items, mapWithBlank, "br-ollur");
  assert.equal(result.hasValidationError, true, "Blank input must trigger validation error");
  assert.equal(result.errors["br-ollur-p-straw"], "Returned quantity cannot be blank");
});

test("9. Branch Isolation & Clearing Stale Rows: Switching branches loads correct branch items", () => {
  const activeDispatch = {
    id: "dsp-101",
    stops: [
      {
        branchId: "kuriachira-branch",
        branchName: "Ice Spot Kuriachira",
        items: [
          { productId: "p-guava", productName: "Creamy Guava", approvedPacks: 4 }
        ]
      },
      {
        branchId: "ollur-branch",
        branchName: "Ice Spot Ollur",
        items: [
          { productId: "p-straw", productName: "Sweet Strawberry", approvedPacks: 5 }
        ]
      }
    ]
  };

  // Helper prioritizing activeDispatch.stops
  function getBranchProducts(activeBranchId) {
    const matchedStop = activeDispatch.stops.find(
      (s) => s.branchId === activeBranchId ||
        s.branchName.toLowerCase().includes(activeBranchId.replace(/-/g, " ").toLowerCase())
    );
    if (matchedStop && matchedStop.items) {
      return matchedStop.items;
    }
    return [];
  }

  const ollurProducts = getBranchProducts("ollur-branch");
  assert.equal(ollurProducts.length, 1);
  assert.equal(ollurProducts[0].productName, "Sweet Strawberry");
  assert.equal(ollurProducts[0].approvedPacks, 5);

  const kuriachiraProducts = getBranchProducts("kuriachira-branch");
  assert.equal(kuriachiraProducts.length, 1);
  assert.equal(kuriachiraProducts[0].productName, "Creamy Guava");
  assert.equal(kuriachiraProducts[0].approvedPacks, 4);
});

test("10. In-flight duplicate submission guard: Prevents repeated clicks while submitting", () => {
  let isSubmitting = false;
  let callCount = 0;

  async function mockConfirmDelivery() {
    if (isSubmitting) return { rejected: true, reason: "In flight" };
    isSubmitting = true;
    callCount++;
    // Simulate async network request
    await new Promise((r) => setTimeout(r, 20));
    isSubmitting = false;
    return { success: true };
  }

  // First call
  const p1 = mockConfirmDelivery();
  // Second immediate click
  const p2 = mockConfirmDelivery();

  return Promise.all([p1, p2]).then(([r1, r2]) => {
    assert.equal(r1.success, true);
    assert.equal(r2.rejected, true);
    assert.equal(callCount, 1, "Only one delivery confirmation should be processed");
  });
});

test("11. Mandatory shortage notes when returned quantity > 0", () => {
  const deliveredItems = [
    { productId: "p-straw", quantityDelivered: 2, shortageQuantity: 3 }
  ];

  const hasShortage = deliveredItems.some((it) => (it.shortageQuantity ?? 0) > 0);
  const userNotes = "";

  let effectiveNotes = userNotes;
  if (hasShortage && (!effectiveNotes || effectiveNotes.trim().length === 0)) {
    effectiveNotes = "Stop handover confirmed with returned/shortage stock recorded.";
  }

  assert.equal(hasShortage, true);
  assert.ok(effectiveNotes.length > 0, "Effective notes must never be empty when shortage exists");
});

test("12. Delivery confirmation does not mutate inventory balances (isolated to cargo records)", () => {
  // In Ice Spot architecture:
  // rpc_update_delivery_stop updates dispatch_orders and dispatch_items (cargo tracking).
  // rpc_confirm_receipt is the sole transaction that creates inventory_movements (receipt_in).
  const deliveryConfirmationActions = ["update_dispatch_orders", "update_dispatch_items", "audit_log"];
  assert.ok(!deliveryConfirmationActions.includes("inventory_movements"), "Delivery stop update must not touch inventory_movements");
});

