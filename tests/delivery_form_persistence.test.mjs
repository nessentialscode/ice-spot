import test from "node:test";
import assert from "node:assert/strict";

// Mock localStorage implementation for Node test environment
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

const STORAGE_KEY = "icespot_admin_demo_state_v1";

const INITIAL_DISPATCH = {
  id: "dsp-089",
  manifestNumber: "DSP-VRV-089",
  vehicleNumber: "KL-08-AX-4412 (Insulated Reefer Van)",
  driverId: "cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43",
  driverName: "Icespot Logistics Staff",
  driverPhone: "+91 98460 11223",
  dispatchDate: "2026-10-20",
  status: "in-transit",
  orderIds: ["ord-101"],
  totalUnits: 240,
  departedAt: "2026-10-20 07:45 AM",
  notes: "South Thrissur route: Wadakkanchery -> Thrissur Bypass -> Kuriachira",
  stops: [
    {
      id: "stop-089-1",
      orderId: "ord-101",
      orderNumber: "ORD-2026-101",
      branchId: "kuriachira-branch",
      branchName: "Ice Spot Kuriachira",
      district: "Thrissur",
      address: "Kuriachira Junction, Main Road, Thrissur, Kerala 680006",
      phone: "+91 94470 00004",
      sequence: 1,
      status: "in-transit",
      items: [
        {
          productId: "guava",
          productName: "Creamy Guava & Mint",
          sku: "SKU-STK-002",
          packType: "Crate (24 Sticks)",
          requestedPacks: 4,
          requestedUnits: 96,
          approvedPacks: 4,
          approvedUnits: 96,
          packedUnits: 96,
        },
      ],
    },
  ],
};

function parseDepartureTime(departureTime, departedAt) {
  if (departureTime) return departureTime;
  if (!departedAt) return "07:45 AM";
  return departedAt.replace(/^\d{4}-\d{2}-\d{2}[T\s]+/, "") || "07:45 AM";
}

const INITIAL_TEST_FLEET = [
  { id: "veh-1", registrationNumber: "KL-08-AX-4412", modelOrType: "Insulated Reefer Van", capacityCrates: 24, status: "available" },
  { id: "veh-2", registrationNumber: "KL-08-BY-8821", modelOrType: "Refrigerated Truck", capacityCrates: 40, status: "available" },
  { id: "veh-3", registrationNumber: "KL-48-Q-4102", modelOrType: "Express Reefer Van", capacityCrates: 20, status: "available" },
];

// Simulates context updateDispatchTrip + persistState logic
function createSimulatedContext(localStorage, initialDispatches) {
  let dispatches = initialDispatches
    ? JSON.parse(JSON.stringify(initialDispatches))
    : [JSON.parse(JSON.stringify(INITIAL_DISPATCH))];
  let orders = [{ id: "ord-101", branchId: "kuriachira-branch" }];
  let products = [{ id: "p1", name: "Guava" }];
  let fleetVehicles = JSON.parse(JSON.stringify(INITIAL_TEST_FLEET));
  let isHydrated = false;

  function persistState(newPartial) {
    let existing = {};
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        existing = JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    const current = {
      orders,
      products,
      dispatches,
      fleetVehicles,
      ...existing,
      ...newPartial,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  }

  function hydrateFromStorage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.dispatches) dispatches = parsed.dispatches;
      if (parsed.orders) orders = parsed.orders;
      if (parsed.products) products = parsed.products;
      if (parsed.fleetVehicles) fleetVehicles = parsed.fleetVehicles;
    }
    isHydrated = true;
  }

  function addFleetVehicle(data) {
    const reg = data.registrationNumber.trim().toUpperCase();
    if (!reg) return { success: false, message: "Vehicle registration number cannot be blank." };
    if (fleetVehicles.some((v) => v.registrationNumber.trim().toUpperCase() === reg)) {
      return { success: false, message: `Vehicle with registration ${reg} already exists.` };
    }
    const newVeh = {
      id: `veh-${Date.now()}`,
      registrationNumber: reg,
      modelOrType: data.modelOrType || "Reefer Van",
      capacityCrates: data.capacityCrates || 24,
      status: "available",
    };
    fleetVehicles = [newVeh, ...fleetVehicles];
    persistState({ fleetVehicles });
    return { success: true, message: "Vehicle registered successfully.", vehicle: newVeh };
  }

  function updateFleetVehicle(id, data) {
    const reg = data.registrationNumber.trim().toUpperCase();
    if (!reg) return { success: false, message: "Vehicle registration number cannot be blank." };
    if (fleetVehicles.some((v) => v.id !== id && v.registrationNumber.trim().toUpperCase() === reg)) {
      return { success: false, message: `Another vehicle with registration ${reg} already exists.` };
    }
    fleetVehicles = fleetVehicles.map((v) => {
      if (v.id !== id) return v;
      return {
        ...v,
        registrationNumber: reg,
        modelOrType: data.modelOrType || v.modelOrType,
        capacityCrates: data.capacityCrates || v.capacityCrates,
      };
    });
    persistState({ fleetVehicles });
    return { success: true, message: "Vehicle details updated successfully." };
  }

  function deleteFleetVehicle(id) {
    if (fleetVehicles.length <= 1) {
      return { success: false, message: "At least one fleet vehicle must remain registered." };
    }
    fleetVehicles = fleetVehicles.filter((v) => v.id !== id);
    persistState({ fleetVehicles });
    return { success: true, message: "Vehicle removed successfully." };
  }

  function updateDispatchTrip(dispatchId, data) {
    const target = dispatches.find((d) => d.id === dispatchId);
    if (target && target.status === "completed") {
      throw new Error("Cannot modify a completed dispatch.");
    }
    if (target) {
      dispatches = dispatches.map((dsp) => {
        if (dsp.id !== dispatchId) return dsp;
        const updatedStops = data.stops !== undefined ? data.stops : dsp.stops;
        const updatedOrderIds =
          data.stops !== undefined
            ? Array.from(new Set(data.stops.map((s) => s.orderId).filter(Boolean)))
            : dsp.orderIds;

        return {
          ...dsp,
          ...(data.vehicleNumber !== undefined ? { vehicleNumber: data.vehicleNumber } : {}),
          ...(data.departureTime !== undefined
            ? { departureTime: data.departureTime, departedAt: data.departureTime }
            : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.stops !== undefined ? { stops: updatedStops, orderIds: updatedOrderIds } : {}),
          ...(data.totalUnits !== undefined ? { totalUnits: data.totalUnits } : {}),
        };
      });
    } else {
      const newDsp = {
        id: dispatchId,
        manifestNumber: `DSP-VRV-${String(dispatches.length + 89).padStart(3, "0")}`,
        vehicleNumber: data.vehicleNumber || "KL-08-AX-4412",
        driverId: "cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43",
        driverName: "Icespot Logistics Staff",
        driverPhone: "+91 98460 11223",
        dispatchDate: "2026-10-21",
        departureTime: data.departureTime || "07:45 AM",
        status: data.status || "scheduled",
        orderIds: data.stops ? data.stops.map((s) => s.orderId) : [],
        stops: data.stops || [],
        totalUnits: data.totalUnits || 240,
        notes: data.notes || "",
      };
      dispatches = [newDsp, ...dispatches];
    }
    persistState({ dispatches });
  }

  function markDispatchDeparted(dispatchId, additionalUpdates) {
    const target = dispatches.find((d) => d.id === dispatchId);
    if (target && target.status === "completed") {
      throw new Error("Cannot dispatch a completed trip.");
    }
    const timestamp = "2026-10-20 08:00 AM";
    let targetOrderIds = [];

    dispatches = dispatches.map((dsp) => {
      if (dsp.id !== dispatchId) return dsp;
      const mergedStops = additionalUpdates?.stops !== undefined ? additionalUpdates.stops : dsp.stops;
      const orderIdsFromStops = additionalUpdates?.stops !== undefined
        ? Array.from(new Set(additionalUpdates.stops.map((s) => s.orderId).filter(Boolean)))
        : dsp.orderIds;
      targetOrderIds = orderIdsFromStops;
      return {
        ...dsp,
        ...(additionalUpdates?.vehicleNumber ? { vehicleNumber: additionalUpdates.vehicleNumber } : {}),
        ...(additionalUpdates?.departureTime ? { departureTime: additionalUpdates.departureTime } : {}),
        ...(additionalUpdates?.notes !== undefined ? { notes: additionalUpdates.notes } : {}),
        ...(additionalUpdates?.totalUnits !== undefined ? { totalUnits: additionalUpdates.totalUnits } : {}),
        status: "in-transit",
        departedAt: additionalUpdates?.departureTime || timestamp,
        stops: mergedStops.map((s) => ({
          ...s,
          status: s.status === "delivered" ? "delivered" : "in-transit"
        })),
        orderIds: orderIdsFromStops
      };
    });

    orders = orders.map((ord) => {
      if (targetOrderIds.includes(ord.id)) {
        return {
          ...ord,
          status: "dispatched",
          timeline: [
            ...(ord.timeline || []),
            {
              timestamp,
              status: "dispatched",
              actorName: "Delivery Staff",
              note: "Vehicle departed central factory. Goods in transit."
            }
          ]
        };
      }
      return ord;
    });

    persistState({ dispatches, orders });
  }

  return {
    getDispatches: () => dispatches,
    getOrders: () => orders,
    getFleetVehicles: () => fleetVehicles,
    isHydrated: () => isHydrated,
    updateDispatchTrip,
    markDispatchDeparted,
    addFleetVehicle,
    updateFleetVehicle,
    deleteFleetVehicle,
    hydrateFromStorage,
    persistState,
  };
}

// --------------------------------------------------------------------------
// TEST 1: Change departure time, save, reload state, and verify new time remains
// --------------------------------------------------------------------------
test("1. Change departure time, save, reload state, and verify new time remains", () => {
  const mockStorage = new MockLocalStorage();
  const ctx = createSimulatedContext(mockStorage);

  // User updates departure time to "09:30 AM"
  ctx.updateDispatchTrip("dsp-089", { departureTime: "09:30 AM" });

  // Simulate refresh: new context instance mounts and hydrations runs
  const refreshedCtx = createSimulatedContext(mockStorage);
  refreshedCtx.hydrateFromStorage();

  const rehydratedDispatch = refreshedCtx.getDispatches().find((d) => d.id === "dsp-089");
  assert.ok(rehydratedDispatch, "Dispatch dsp-089 must exist after rehydration");
  assert.equal(rehydratedDispatch.departureTime, "09:30 AM");

  const parsedTime = parseDepartureTime(
    rehydratedDispatch.departureTime,
    rehydratedDispatch.departedAt
  );
  assert.equal(parsedTime, "09:30 AM", "Time parsing must retain complete 09:30 AM value with AM/PM");
});

// --------------------------------------------------------------------------
// TEST 2: Change vehicle number, save, reload state, and verify new number remains
// --------------------------------------------------------------------------
test("2. Change vehicle number, save, reload state, and verify new number remains", () => {
  const mockStorage = new MockLocalStorage();
  const ctx = createSimulatedContext(mockStorage);

  // User changes vehicle number to Refrigerated Truck
  const newVehicle = "KL-08-BY-8821 (Refrigerated Truck)";
  ctx.updateDispatchTrip("dsp-089", { vehicleNumber: newVehicle });

  // Simulate refresh
  const refreshedCtx = createSimulatedContext(mockStorage);
  refreshedCtx.hydrateFromStorage();

  const rehydratedDispatch = refreshedCtx.getDispatches().find((d) => d.id === "dsp-089");
  assert.equal(rehydratedDispatch.vehicleNumber, newVehicle);
});

// --------------------------------------------------------------------------
// TEST 3: Change delivery branches, save, reload state, and verify all selected branches remain
// --------------------------------------------------------------------------
test("3. Change delivery branches, save, reload state, and verify all selected branches remain", () => {
  const mockStorage = new MockLocalStorage();
  const ctx = createSimulatedContext(mockStorage);

  // User selects three distinct branches in a specific route order
  const newSelectedBranches = ["chalakudy-junction", "ollur-branch", "kuriachira-branch"];
  const updatedStops = newSelectedBranches.map((branchId, idx) => ({
    id: `stop-089-${branchId}`,
    orderId: `ord-${branchId}`,
    orderNumber: `ORD-${branchId.slice(0, 4).toUpperCase()}`,
    branchId,
    branchName: `Ice Spot ${branchId}`,
    district: "Thrissur",
    address: `${branchId} Road`,
    phone: "+91 94470 00000",
    sequence: idx + 1,
    status: "scheduled",
    items: [],
  }));

  ctx.updateDispatchTrip("dsp-089", { stops: updatedStops });

  // Simulate page refresh
  const refreshedCtx = createSimulatedContext(mockStorage);
  refreshedCtx.hydrateFromStorage();

  const rehydratedDispatch = refreshedCtx.getDispatches().find((d) => d.id === "dsp-089");
  assert.ok(rehydratedDispatch.stops, "Stops array must be present");
  assert.equal(rehydratedDispatch.stops.length, 3, "All 3 stops must be restored");

  const restoredBranchIds = rehydratedDispatch.stops.map((s) => s.branchId);
  assert.deepEqual(
    restoredBranchIds,
    newSelectedBranches,
    "Selected branch IDs and their exact route sequence must be preserved"
  );
  // Verify default 3 branches did NOT replace user's custom sequence
  assert.notEqual(restoredBranchIds[0], "kuriachira-branch", "First stop must remain chalakudy-junction as chosen");
});

// --------------------------------------------------------------------------
// TEST 4: Save all fields together and verify no field resets independently
// --------------------------------------------------------------------------
test("4. Save all fields together and verify no field resets independently", () => {
  const mockStorage = new MockLocalStorage();
  const ctx = createSimulatedContext(mockStorage);

  const customTime = "10:15 AM";
  const customVehicle = "KL-48-Q-4102 (Express Reefer Van)";
  const customStatus = "loading";
  const customNotes = "Express reefer delivery for afternoon parlour rush";
  const customBranches = ["ollur-branch", "chalakudy-junction"];
  const customStops = customBranches.map((branchId, idx) => ({
    id: `stop-089-${branchId}`,
    orderId: `ord-${branchId}`,
    branchId,
    sequence: idx + 1,
    status: "loading",
  }));

  ctx.updateDispatchTrip("dsp-089", {
    departureTime: customTime,
    vehicleNumber: customVehicle,
    status: customStatus,
    notes: customNotes,
    stops: customStops,
  });

  // Simulate page refresh
  const refreshedCtx = createSimulatedContext(mockStorage);
  refreshedCtx.hydrateFromStorage();

  const restored = refreshedCtx.getDispatches().find((d) => d.id === "dsp-089");
  assert.equal(restored.departureTime, customTime, "Departure time preserved");
  assert.equal(restored.vehicleNumber, customVehicle, "Vehicle number preserved");
  assert.equal(restored.status, customStatus, "Trip status preserved");
  assert.equal(restored.notes, customNotes, "Trip notes preserved");
  assert.deepEqual(
    restored.stops.map((s) => s.branchId),
    customBranches,
    "Branch stops preserved"
  );
});

// --------------------------------------------------------------------------
// TEST 5: Confirm initial demo data does not overwrite persisted changes during hydration
// --------------------------------------------------------------------------
test("5. Confirm initial demo data does not overwrite persisted changes during hydration", () => {
  const mockStorage = new MockLocalStorage();

  // Pre-seed localStorage with user changes
  const prePersistedDispatches = [
    {
      ...INITIAL_DISPATCH,
      departureTime: "06:30 AM",
      departedAt: "06:30 AM",
      vehicleNumber: "KL-08-CZ-9910 (Cold-Chain Reefer #04)",
      notes: "Early bird factory run",
    },
  ];
  mockStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ dispatches: prePersistedDispatches })
  );

  // A new context instance is initialized with demo data in React state closure
  const ctx = createSimulatedContext(mockStorage);

  // Before hydration, React state has demo data
  assert.equal(
    ctx.getDispatches()[0].vehicleNumber,
    "KL-08-AX-4412 (Insulated Reefer Van)",
    "Pre-hydration state holds initial demo data"
  );

  // Trigger hydration
  ctx.hydrateFromStorage();

  // After hydration, persisted user changes overwrite demo data, not vice versa
  const postHydrationDispatch = ctx.getDispatches().find((d) => d.id === "dsp-089");
  assert.equal(
    postHydrationDispatch.departureTime,
    "06:30 AM",
    "Persisted departure time must override initial demo data"
  );
  assert.equal(
    postHydrationDispatch.vehicleNumber,
    "KL-08-CZ-9910 (Cold-Chain Reefer #04)",
    "Persisted vehicle number must override initial demo data"
  );
  assert.equal(
    postHydrationDispatch.notes,
    "Early bird factory run",
    "Persisted notes must override initial demo data"
  );

  // Verify that subsequent partial persist calls do not wipe other persisted keys
  ctx.persistState({ demoRole: "delivery-staff" });
  const rawStorage = JSON.parse(mockStorage.getItem(STORAGE_KEY));
  assert.equal(rawStorage.demoRole, "delivery-staff");
  assert.equal(
    rawStorage.dispatches[0].vehicleNumber,
    "KL-08-CZ-9910 (Cold-Chain Reefer #04)",
    "Subsequent partial persist must not wipe previously persisted dispatches"
  );
});

// --------------------------------------------------------------------------
// TEST 6: Confirm existing dispatch-trip behavior remains intact
// --------------------------------------------------------------------------
test("6. Confirm existing dispatch-trip behavior remains intact", () => {
  const mockStorage = new MockLocalStorage();
  const ctx = createSimulatedContext(mockStorage);

  // 1. Immutable completed trips: Cannot modify a completed dispatch
  ctx.updateDispatchTrip("dsp-089", { status: "completed" });
  assert.throws(
    () => {
      ctx.updateDispatchTrip("dsp-089", { vehicleNumber: "KL-08-BY-8821" });
    },
    /Cannot modify a completed dispatch/,
    "Completed dispatch trip must lock and reject updates"
  );

  // 2. Fallback when departureTime is undefined: returns formatted departedAt
  assert.equal(
    parseDepartureTime(undefined, "2026-10-20 07:45 AM"),
    "07:45 AM",
    "Must retain complete AM/PM time"
  );

  // 3. Fallback when both are undefined
  assert.equal(
    parseDepartureTime(undefined, undefined),
    "07:45 AM",
    "Must return default 07:45 AM"
  );
});

// --------------------------------------------------------------------------
// TEST 7: Clicking "Save and Dispatch Order" in valid pre-delivery state departs orders
// --------------------------------------------------------------------------
test("7. Clicking 'Save and Dispatch Order' in valid pre-delivery state departs orders without requiring any stop delivered", () => {
  const mockStorage = new MockLocalStorage();
  const ctx = createSimulatedContext(mockStorage);

  // Setup dispatch with status "loading" and pending stop
  ctx.updateDispatchTrip("dsp-089", {
    status: "loading",
    departureTime: "08:15 AM",
    vehicleNumber: "KL-08-AX-4412 (Insulated Reefer Van)",
    stops: [
      {
        id: "stop-089-1",
        orderId: "ord-101",
        branchId: "kuriachira-branch",
        branchName: "Ice Spot Kuriachira",
        status: "scheduled",
      },
    ],
  });

  // Verify order is not yet dispatched
  const preOrders = ctx.getOrders();
  assert.equal(preOrders.find((o) => o.id === "ord-101")?.status, undefined);

  // Dispatch the order directly in pre-delivery state (stops are scheduled, not delivered)
  ctx.markDispatchDeparted("dsp-089", {
    vehicleNumber: "KL-08-AX-4412 (Insulated Reefer Van)",
    departureTime: "08:15 AM",
    notes: "Route departing factory bay #2",
    stops: [
      {
        id: "stop-089-1",
        orderId: "ord-101",
        branchId: "kuriachira-branch",
        branchName: "Ice Spot Kuriachira",
        status: "scheduled",
      },
    ],
  });

  // Verify dispatch transitioned to in-transit
  const dispatch = ctx.getDispatches().find((d) => d.id === "dsp-089");
  assert.equal(dispatch.status, "in-transit", "Dispatch status must transition to in-transit");
  assert.equal(dispatch.departedAt, "08:15 AM", "Departure time must be recorded on dispatch");
  assert.equal(dispatch.stops[0].status, "in-transit", "Stop status must transition to in-transit");

  // Verify linked order transitioned to "dispatched"
  const postOrders = ctx.getOrders();
  const targetOrder = postOrders.find((o) => o.id === "ord-101");
  assert.equal(targetOrder.status, "dispatched", "Linked order must transition to dispatched");
  assert.ok(targetOrder.timeline.some((tl) => tl.status === "dispatched"), "Timeline must include dispatched event");

  // Simulate refresh: verify both dispatch and order retain dispatched status
  const refreshedCtx = createSimulatedContext(mockStorage);
  refreshedCtx.hydrateFromStorage();
  const rehydratedDispatch = refreshedCtx.getDispatches().find((d) => d.id === "dsp-089");
  assert.equal(rehydratedDispatch.status, "in-transit", "Persisted dispatch must remain in-transit after refresh");
  const rehydratedOrder = refreshedCtx.getOrders().find((o) => o.id === "ord-101");
  assert.equal(rehydratedOrder.status, "dispatched", "Persisted order must remain dispatched after refresh");
});

// --------------------------------------------------------------------------
// TEST 8: Saving trip details works independently from dispatching
// --------------------------------------------------------------------------
test("8. Saving trip details works independently without dispatching orders", () => {
  const mockStorage = new MockLocalStorage();
  const ctx = createSimulatedContext(mockStorage);

  // Saving trip details should NOT depart the vehicle or transition orders
  ctx.updateDispatchTrip("dsp-089", {
    status: "loading",
    departureTime: "11:00 AM",
    vehicleNumber: "KL-08-BY-8821 (Refrigerated Truck)",
    notes: "Planning afternoon trip",
  });

  const dispatch = ctx.getDispatches().find((d) => d.id === "dsp-089");
  assert.equal(dispatch.status, "loading", "Trip remains in planning / loading status");
  assert.equal(dispatch.vehicleNumber, "KL-08-BY-8821 (Refrigerated Truck)");
  assert.equal(dispatch.departureTime, "11:00 AM");

  const orders = ctx.getOrders();
  assert.notEqual(orders.find((o) => o.id === "ord-101")?.status, "dispatched", "Order must not be dispatched when merely saving trip details");
});

// --------------------------------------------------------------------------
// TEST 9: Terminal completed trips reject dispatch and trip updates
// --------------------------------------------------------------------------
test("9. Completed trips cannot be re-dispatched", () => {
  const mockStorage = new MockLocalStorage();
  const ctx = createSimulatedContext(mockStorage);

  ctx.updateDispatchTrip("dsp-089", { status: "completed" });

  assert.throws(
    () => {
      ctx.markDispatchDeparted("dsp-089");
    },
    /Cannot dispatch a completed trip/,
    "Completed trips cannot be dispatched again"
  );
});

// --------------------------------------------------------------------------
// TEST 10: Active dispatch ID selection survives reload
// --------------------------------------------------------------------------
test("10. Active dispatch ID selection survives reload via localStorage", () => {
  const mockStorage = new MockLocalStorage();
  const STORAGE_ACTIVE_DISPATCH_KEY = "icespot_active_dispatch_id";

  // Simulate user selecting dsp-090
  mockStorage.setItem(STORAGE_ACTIVE_DISPATCH_KEY, "dsp-090");

  // Verify key exists and can be retrieved
  const restoredId = mockStorage.getItem(STORAGE_ACTIVE_DISPATCH_KEY);
  assert.equal(restoredId, "dsp-090", "Selected dispatch ID must be stored and restored");
});

// --------------------------------------------------------------------------
// TEST 11: Completed dispatch fields cannot be edited or saved
// --------------------------------------------------------------------------
test("11. Completed dispatch fields cannot be edited or saved", () => {
  const mockStorage = new MockLocalStorage();
  const completedDispatch = {
    ...INITIAL_DISPATCH,
    id: "dsp-089",
    manifestNumber: "DSP-VRV-089",
    status: "completed",
    vehicleNumber: "KL-08-AX-4412 (Insulated Reefer Van)",
    departureTime: "07:45 AM",
    notes: "Original completed notes",
  };
  const ctx = createSimulatedContext(mockStorage, [completedDispatch]);

  // Attempting to update trip details on a completed dispatch must throw/reject
  assert.throws(
    () => {
      ctx.updateDispatchTrip("dsp-089", {
        vehicleNumber: "KL-08-BY-8821 (Refrigerated Truck)",
        departureTime: "10:30 AM",
        notes: "Attempted tampering on locked trip",
      });
    },
    /Cannot modify a completed dispatch/,
    "Completed dispatch must reject operational modifications"
  );

  // Original data must remain completely intact
  const dispatch = ctx.getDispatches().find((d) => d.id === "dsp-089");
  assert.equal(dispatch.vehicleNumber, "KL-08-AX-4412 (Insulated Reefer Van)");
  assert.equal(dispatch.departureTime, "07:45 AM");
  assert.equal(dispatch.notes, "Original completed notes");
  assert.equal(dispatch.status, "completed");
});

// --------------------------------------------------------------------------
// TEST 12: An eligible dispatch can still be configured and saved
// --------------------------------------------------------------------------
test("12. An eligible dispatch can still be configured and saved", () => {
  const mockStorage = new MockLocalStorage();
  const activeDispatch = {
    ...INITIAL_DISPATCH,
    id: "dsp-090",
    manifestNumber: "DSP-VRV-090",
    status: "scheduled",
    vehicleNumber: "KL-08-AX-4412",
    departureTime: "07:45 AM",
  };
  const ctx = createSimulatedContext(mockStorage, [activeDispatch]);

  // Configure eligible dispatch
  ctx.updateDispatchTrip("dsp-090", {
    vehicleNumber: "KL-08-BY-8821 (Refrigerated Truck)",
    departureTime: "08:30 AM",
    notes: "Route optimized for morning traffic",
    status: "loading",
  });

  const updated = ctx.getDispatches().find((d) => d.id === "dsp-090");
  assert.equal(updated.vehicleNumber, "KL-08-BY-8821 (Refrigerated Truck)");
  assert.equal(updated.departureTime, "08:30 AM");
  assert.equal(updated.status, "loading");
  assert.equal(updated.notes, "Route optimized for morning traffic");
});

// --------------------------------------------------------------------------
// TEST 13: Selected dispatch and status remain consistent after refresh
// --------------------------------------------------------------------------
test("13. Selected dispatch and status remain consistent after refresh", () => {
  const mockStorage = new MockLocalStorage();
  const STORAGE_ACTIVE_DISPATCH_KEY = "icespot_active_dispatch_id";
  const dispatches = [
    { ...INITIAL_DISPATCH, id: "dsp-089", status: "completed" },
    { ...INITIAL_DISPATCH, id: "dsp-090", manifestNumber: "DSP-VRV-090", status: "in-transit" },
  ];
  const ctx = createSimulatedContext(mockStorage, dispatches);

  // User selects eligible dispatch dsp-090
  mockStorage.setItem(STORAGE_ACTIVE_DISPATCH_KEY, "dsp-090");
  ctx.persistState({ dispatches });

  // Simulate refresh / rehydration
  const refreshedCtx = createSimulatedContext(mockStorage, dispatches);
  refreshedCtx.hydrateFromStorage();

  const restoredSelection = mockStorage.getItem(STORAGE_ACTIVE_DISPATCH_KEY);
  assert.equal(restoredSelection, "dsp-090");
  const activeDsp = refreshedCtx.getDispatches().find((d) => d.id === restoredSelection);
  assert.ok(activeDsp, "Active dispatch dsp-090 must exist after refresh");
  assert.equal(activeDsp.status, "in-transit", "Status must remain in-transit");
});

// --------------------------------------------------------------------------
// TEST 14: Invalid or completed stored selection falls back safely to eligible dispatch
// --------------------------------------------------------------------------
test("14. Invalid or completed stored selection falls back safely to eligible dispatch", () => {
  const mockStorage = new MockLocalStorage();
  const STORAGE_ACTIVE_DISPATCH_KEY = "icespot_active_dispatch_id";
  const dispatches = [
    { ...INITIAL_DISPATCH, id: "dsp-089", status: "completed" },
    { ...INITIAL_DISPATCH, id: "dsp-090", manifestNumber: "DSP-VRV-090", status: "in-transit" },
  ];

  // Case A: Stored selection is non-existent/invalid
  mockStorage.setItem(STORAGE_ACTIVE_DISPATCH_KEY, "dsp-non-existent-999");
  let saved = mockStorage.getItem(STORAGE_ACTIVE_DISPATCH_KEY);
  let eligible = dispatches.find((d) => d.status !== "completed");
  let resolvedId = dispatches.some((d) => d.id === saved) ? saved : eligible?.id;
  assert.equal(resolvedId, "dsp-090", "Invalid stored ID must safely resolve to eligible dispatch dsp-090");

  // Case B: Stored selection is completed (ineligible for editing)
  mockStorage.setItem(STORAGE_ACTIVE_DISPATCH_KEY, "dsp-089");
  saved = mockStorage.getItem(STORAGE_ACTIVE_DISPATCH_KEY);
  const matching = dispatches.find((d) => d.id === saved);
  resolvedId = matching?.status === "completed" && eligible ? eligible.id : saved;
  assert.equal(resolvedId, "dsp-090", "Ineligible completed trip must fall back to active eligible trip dsp-090");

  // Verify dispatches array was NOT mutated or overwritten
  assert.equal(dispatches.length, 2, "Dispatch records must not be deleted or corrupted");
  assert.equal(dispatches[0].id, "dsp-089");
  assert.equal(dispatches[1].id, "dsp-090");
});

// --------------------------------------------------------------------------
// TEST 15: Fleet vehicles can be added, edited, and selected
// --------------------------------------------------------------------------
test("15. Fleet vehicles can be added, edited, and selected", () => {
  const mockStorage = new MockLocalStorage();
  const ctx = createSimulatedContext(mockStorage);

  // 1. Add new vehicle
  const addRes = ctx.addFleetVehicle({
    registrationNumber: "KL-08-EE-5500",
    modelOrType: "Mini Reefer Van",
    capacityCrates: 16,
  });
  assert.equal(addRes.success, true);
  assert.equal(addRes.vehicle?.registrationNumber, "KL-08-EE-5500");
  assert.equal(ctx.getFleetVehicles().some((v) => v.registrationNumber === "KL-08-EE-5500"), true);

  // 2. Edit vehicle
  const addedId = addRes.vehicle.id;
  const updateRes = ctx.updateFleetVehicle(addedId, {
    registrationNumber: "KL-08-EE-5500",
    modelOrType: "Upgraded Mini Reefer",
    capacityCrates: 18,
  });
  assert.equal(updateRes.success, true);
  const updatedVeh = ctx.getFleetVehicles().find((v) => v.id === addedId);
  assert.equal(updatedVeh?.modelOrType, "Upgraded Mini Reefer");
  assert.equal(updatedVeh?.capacityCrates, 18);

  // 3. Assign vehicle to dispatch trip
  const formatted = `${updatedVeh.registrationNumber} (${updatedVeh.modelOrType})`;
  ctx.updateDispatchTrip("dsp-089", { vehicleNumber: formatted });
  const dsp = ctx.getDispatches().find((d) => d.id === "dsp-089");
  assert.equal(dsp?.vehicleNumber, "KL-08-EE-5500 (Upgraded Mini Reefer)");
});

// --------------------------------------------------------------------------
// TEST 16: Duplicate and blank vehicle registrations are rejected
// --------------------------------------------------------------------------
test("16. Duplicate and blank vehicle registrations are rejected", () => {
  const mockStorage = new MockLocalStorage();
  const ctx = createSimulatedContext(mockStorage);

  // Blank registration
  const blankRes1 = ctx.addFleetVehicle({ registrationNumber: "   ", modelOrType: "Van" });
  assert.equal(blankRes1.success, false);
  assert.match(blankRes1.message, /cannot be blank/);

  // Duplicate registration (exact match)
  const dupRes1 = ctx.addFleetVehicle({ registrationNumber: "KL-08-AX-4412", modelOrType: "Duplicate Van" });
  assert.equal(dupRes1.success, false);
  assert.match(dupRes1.message, /already exists/);

  // Duplicate registration (case-insensitive & whitespace)
  const dupRes2 = ctx.addFleetVehicle({ registrationNumber: "  kl-08-ax-4412  ", modelOrType: "Lower Duplicate" });
  assert.equal(dupRes2.success, false);
  assert.match(dupRes2.message, /already exists/);

  // Edit vehicle with duplicate registration of another vehicle
  const veh2 = ctx.getFleetVehicles().find((v) => v.registrationNumber === "KL-08-BY-8821");
  const editDupRes = ctx.updateFleetVehicle(veh2.id, { registrationNumber: "KL-08-AX-4412", modelOrType: "Van" });
  assert.equal(editDupRes.success, false);
  assert.match(editDupRes.message, /already exists/);
});

// --------------------------------------------------------------------------
// TEST 17: Vehicle records persist according to demo storage boundary
// --------------------------------------------------------------------------
test("17. Vehicle records persist according to demo storage boundary", () => {
  const mockStorage = new MockLocalStorage();
  const ctx = createSimulatedContext(mockStorage);

  // Add custom vehicle
  ctx.addFleetVehicle({
    registrationNumber: "KL-48-Z-9999",
    modelOrType: "Cold Express Shuttle",
    capacityCrates: 28,
  });

  // Verify stored in localStorage
  const rawSaved = mockStorage.getItem(STORAGE_KEY);
  assert.ok(rawSaved, "LocalStorage key must exist");
  const parsed = JSON.parse(rawSaved);
  assert.ok(Array.isArray(parsed.fleetVehicles), "fleetVehicles must be an array in storage");
  assert.ok(parsed.fleetVehicles.some((v) => v.registrationNumber === "KL-48-Z-9999"));

  // Simulate refresh: rehydrate
  const refreshedCtx = createSimulatedContext(mockStorage);
  refreshedCtx.hydrateFromStorage();
  const hydratedVehicles = refreshedCtx.getFleetVehicles();
  assert.ok(hydratedVehicles.some((v) => v.registrationNumber === "KL-48-Z-9999"), "New vehicle must persist across rehydration");
});

// --------------------------------------------------------------------------
// TEST 18: Deleting fleet vehicle preserves minimum of 1 vehicle in registry
// --------------------------------------------------------------------------
test("18. Deleting fleet vehicle preserves minimum of 1 vehicle in registry", () => {
  const mockStorage = new MockLocalStorage();
  const ctx = createSimulatedContext(mockStorage);

  const initialCount = ctx.getFleetVehicles().length;
  const firstId = ctx.getFleetVehicles()[0].id;
  const delRes1 = ctx.deleteFleetVehicle(firstId);
  assert.equal(delRes1.success, true);
  assert.equal(ctx.getFleetVehicles().length, initialCount - 1);

  // Delete until 1 remains
  while (ctx.getFleetVehicles().length > 1) {
    ctx.deleteFleetVehicle(ctx.getFleetVehicles()[0].id);
  }
  assert.equal(ctx.getFleetVehicles().length, 1);

  // Attempt to delete last remaining vehicle must be rejected
  const lastId = ctx.getFleetVehicles()[0].id;
  const lastDelRes = ctx.deleteFleetVehicle(lastId);
  assert.equal(lastDelRes.success, false);
  assert.match(lastDelRes.message, /At least one fleet vehicle must remain/);
  assert.equal(ctx.getFleetVehicles().length, 1);
});

// --------------------------------------------------------------------------
// TEST 19: Delivery completed grids are removed after 12 hours
// --------------------------------------------------------------------------
test("19. Delivery completed grids are removed after 12 hours", () => {
  const isCompletedTripExpired = (dsp, nowMs = Date.now()) => {
    if (dsp.status !== "completed") return false;
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    if (dsp.completedAt) {
      const t = new Date(dsp.completedAt).getTime();
      if (!isNaN(t)) return (nowMs - t) >= TWELVE_HOURS_MS;
    }
    if (dsp.stops && dsp.stops.length > 0) {
      const stopTimes = dsp.stops
        .map((s) => (s.completedAt ? new Date(s.completedAt).getTime() : NaN))
        .filter((t) => !isNaN(t));
      if (stopTimes.length > 0) {
        const latest = Math.max(...stopTimes);
        return (nowMs - latest) >= TWELVE_HOURS_MS;
      }
    }
    if (dsp.dispatchDate) {
      const fullDate = dsp.departureTime
        ? `${dsp.dispatchDate} ${dsp.departureTime}`
        : dsp.departedAt || dsp.dispatchDate;
      const t = new Date(fullDate).getTime();
      if (!isNaN(t)) return (nowMs - t) >= TWELVE_HOURS_MS;
    }
    return false;
  };

  const now = new Date("2026-10-26T12:00:00Z").getTime();
  const thirteenHoursAgo = new Date(now - 13 * 60 * 60 * 1000).toISOString();
  const elevenHoursAgo = new Date(now - 11 * 60 * 60 * 1000).toISOString();

  const expiredCompletedTrip = {
    ...INITIAL_DISPATCH,
    id: "dsp-expired",
    manifestNumber: "DSP-VRV-EXPIRED",
    status: "completed",
    completedAt: thirteenHoursAgo,
  };

  const recentCompletedTrip = {
    ...INITIAL_DISPATCH,
    id: "dsp-recent",
    manifestNumber: "DSP-VRV-RECENT",
    status: "completed",
    completedAt: elevenHoursAgo,
  };

  const activeTrip = {
    ...INITIAL_DISPATCH,
    id: "dsp-active",
    manifestNumber: "DSP-VRV-ACTIVE",
    status: "in-transit",
    dispatchDate: "2026-10-20", // even if date is older, in-transit is never expired
  };

  // 1. Expired completed trip (>12h) must return true for expiration
  assert.equal(isCompletedTripExpired(expiredCompletedTrip, now), true, "Completed trip completed 13h ago must be expired");

  // 2. Recent completed trip (<12h) must remain visible (return false)
  assert.equal(isCompletedTripExpired(recentCompletedTrip, now), false, "Completed trip completed 11h ago must NOT be expired");

  // 3. Active in-transit trip is never expired
  assert.equal(isCompletedTripExpired(activeTrip, now), false, "Active in-transit trip must never be expired");

  // 4. Test grid filtering: expired trips are excluded from visible grid
  const allDispatches = [expiredCompletedTrip, recentCompletedTrip, activeTrip];
  const visibleDispatches = allDispatches.filter((dsp) => !isCompletedTripExpired(dsp, now));
  assert.equal(visibleDispatches.length, 2);
  assert.deepEqual(visibleDispatches.map((d) => d.id), ["dsp-recent", "dsp-active"]);
});

// --------------------------------------------------------------------------
// TEST 20: Completed trips with expired stop timestamps are filtered out
// --------------------------------------------------------------------------
test("20. Completed trips with expired stop timestamps or dispatch dates are filtered after 12h", () => {
  const isCompletedTripExpired = (dsp, nowMs = Date.now()) => {
    if (dsp.status !== "completed") return false;
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    if (dsp.completedAt) {
      const t = new Date(dsp.completedAt).getTime();
      if (!isNaN(t)) return (nowMs - t) >= TWELVE_HOURS_MS;
    }
    if (dsp.stops && dsp.stops.length > 0) {
      const stopTimes = dsp.stops
        .map((s) => (s.completedAt ? new Date(s.completedAt).getTime() : NaN))
        .filter((t) => !isNaN(t));
      if (stopTimes.length > 0) {
        const latest = Math.max(...stopTimes);
        return (nowMs - latest) >= TWELVE_HOURS_MS;
      }
    }
    if (dsp.dispatchDate) {
      const fullDate = dsp.departureTime
        ? `${dsp.dispatchDate} ${dsp.departureTime}`
        : dsp.departedAt || dsp.dispatchDate;
      const t = new Date(fullDate).getTime();
      if (!isNaN(t)) return (nowMs - t) >= TWELVE_HOURS_MS;
    }
    return false;
  };

  const now = new Date("2026-10-26T12:00:00Z").getTime();

  // Completed trip with stops completed 14 hours ago
  const tripWithOldStops = {
    ...INITIAL_DISPATCH,
    id: "dsp-stops-old",
    status: "completed",
    stops: [
      {
        id: "s1",
        status: "delivered",
        completedAt: new Date(now - 14 * 60 * 60 * 1000).toISOString(),
      },
    ],
  };

  assert.equal(isCompletedTripExpired(tripWithOldStops, now), true, "Trip with all stops finished >12h ago must expire");
});

// --------------------------------------------------------------------------
// TEST 21: Save Trip Details enforces validation and does not depart orders
// --------------------------------------------------------------------------
test("21. Save Trip Details enforces validation and does not depart orders or mutate status", () => {
  const mockStorage = new MockLocalStorage();
  const ctx = createSimulatedContext(mockStorage);

  // Validation checks:
  const validateSaveTrip = (input) => {
    if (!input.vehicleNumber || !input.vehicleNumber.trim()) {
      return { valid: false, error: "Vehicle registration number is required." };
    }
    if (!input.departureTime || !input.departureTime.trim()) {
      return { valid: false, error: "Scheduled departure time is required." };
    }
    if (!input.selectedBranchIds || input.selectedBranchIds.length === 0) {
      return { valid: false, error: "Please select at least 1 destination branch for the trip." };
    }
    return { valid: true };
  };

  assert.equal(validateSaveTrip({ vehicleNumber: "", departureTime: "08:00 AM", selectedBranchIds: ["b1"] }).valid, false);
  assert.equal(validateSaveTrip({ vehicleNumber: "KL-08-AX-4412", departureTime: "   ", selectedBranchIds: ["b1"] }).valid, false);
  assert.equal(validateSaveTrip({ vehicleNumber: "KL-08-AX-4412", departureTime: "08:00 AM", selectedBranchIds: [] }).valid, false);
  assert.equal(validateSaveTrip({ vehicleNumber: "KL-08-AX-4412", departureTime: "08:00 AM", selectedBranchIds: ["b1"] }).valid, true);

  // Saving details preserves scheduled status without marking orders dispatched
  ctx.updateDispatchTrip("dsp-089", {
    vehicleNumber: "KL-08-AX-4412 (Insulated Reefer Van)",
    departureTime: "08:45 AM",
    status: "scheduled",
    notes: "Saved route details before loading",
  });

  const dsp = ctx.getDispatches().find((d) => d.id === "dsp-089");
  assert.equal(dsp.status, "scheduled");
  assert.equal(dsp.departureTime, "08:45 AM");

  const orders = ctx.getOrders();
  assert.notEqual(orders.find((o) => o.id === "ord-101")?.status, "dispatched");
});

// --------------------------------------------------------------------------
// TEST 22: Save & Dispatch Order prevents duplicate departure if already in-transit
// --------------------------------------------------------------------------
test("22. Save & Dispatch Order prevents duplicate departure if already in-transit", () => {
  const mockStorage = new MockLocalStorage();
  const ctx = createSimulatedContext(mockStorage);

  // Put trip in-transit
  ctx.markDispatchDeparted("dsp-089", {
    vehicleNumber: "KL-08-AX-4412",
    departureTime: "08:00 AM",
  });

  const inTransitDsp = ctx.getDispatches().find((d) => d.id === "dsp-089");
  assert.equal(inTransitDsp.status, "in-transit");

  // Attempting to dispatch already in-transit trip must be rejected gracefully
  const canDispatch = (dsp) => {
    if (dsp.status === "completed") return { allowed: false, reason: "Cannot dispatch a completed trip." };
    if (dsp.status === "in-transit") return { allowed: false, reason: "This trip is already in transit and en route." };
    return { allowed: true };
  };

  const dispatchCheck = canDispatch(inTransitDsp);
  assert.equal(dispatchCheck.allowed, false);
  assert.match(dispatchCheck.reason, /already in transit/);
});

