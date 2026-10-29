import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ==============================================================================
// 1. STATIC MIGRATION & SQL HARDENING AUDIT
// ==============================================================================

test("1. Migration 20261026000000 exists and adheres to PostgreSQL security standards", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20261026000000_add_rpc_update_dispatch_trip.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Migration file 20261026000000 must exist");

  const sql = fs.readFileSync(migrationPath, "utf-8");

  // Function signature and naming
  assert.ok(
    sql.includes("CREATE OR REPLACE FUNCTION public.rpc_update_dispatch_trip"),
    "Must create or replace public.rpc_update_dispatch_trip"
  );

  // Parameter list conformance
  assert.ok(sql.includes("p_dispatch_id UUID"), "Must accept p_dispatch_id UUID");
  assert.ok(sql.includes("p_vehicle_number TEXT DEFAULT NULL"), "Must accept p_vehicle_number TEXT DEFAULT NULL");
  assert.ok(sql.includes("p_departure_time TEXT DEFAULT NULL"), "Must accept p_departure_time TEXT DEFAULT NULL");
  assert.ok(sql.includes("p_status TEXT DEFAULT NULL"), "Must accept p_status TEXT DEFAULT NULL");
  assert.ok(sql.includes("p_notes TEXT DEFAULT NULL"), "Must accept p_notes TEXT DEFAULT NULL");

  // Security Definer and pinned search path
  assert.ok(sql.includes("SECURITY DEFINER"), "Function must be declared SECURITY DEFINER");
  assert.ok(sql.includes("SET search_path = ''"), "Function must pin search_path = '' to prevent search_path hijacking");

  // Transactional row lock FOR UPDATE
  assert.ok(
    sql.includes("FROM public.dispatches") && sql.includes("FOR UPDATE;"),
    "Must serialize concurrent trip updates via SELECT ... FOR UPDATE on public.dispatches"
  );

  // Standard SQL keyword compliance (COALESCE, NULLIF must NOT be schema-qualified)
  assert.ok(!/pg_catalog\s*\.\s*(coalesce|nullif|greatest|least)\s*\(/i.test(sql), "COALESCE/NULLIF must NOT be schema-qualified");
  assert.ok(/\bCOALESCE\s*\(/i.test(sql), "Must use standard COALESCE(...) expression");
  assert.ok(/\bNULLIF\s*\(/i.test(sql), "Must use standard NULLIF(...) expression");

  // Least Privilege (PoLP) permissions
  assert.ok(
    sql.includes("REVOKE ALL ON FUNCTION public.rpc_update_dispatch_trip(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;"),
    "Execution must be revoked from PUBLIC and anon"
  );
  assert.ok(
    sql.includes("GRANT EXECUTE ON FUNCTION public.rpc_update_dispatch_trip(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;"),
    "Execution must be granted strictly to authenticated"
  );

  // Table write privilege boundary: No direct table writes granted
  assert.ok(
    !sql.includes("GRANT UPDATE ON public.dispatches"),
    "Must NOT grant broad direct table UPDATE on dispatches to authenticated"
  );

  // Completion integrity check
  assert.ok(
    sql.includes("Cannot set trip status to") && sql.includes("rpc_confirm_receipt"),
    "Must disallow direct delivered status on trip header"
  );
  assert.ok(
    sql.includes("SELECT pg_catalog.count(*) INTO v_unconfirmed_stops") &&
    sql.includes("FROM public.dispatch_orders do_stop") &&
    sql.includes("public.receipts r"),
    "Must verify that all attached stops have confirmed receipts before allowing completed status"
  );
  assert.ok(
    sql.includes("v_failed_stops") && sql.includes("Failed stops must be resolved and reconciled before completion"),
    "Must reject completion if any attached stops have failed"
  );
  assert.ok(
    sql.includes("r.confirmed_by IS NOT NULL") &&
    sql.includes("r.receipt_status IN ('intact'::public.receipt_status, 'discrepancy'::public.receipt_status, 'confirmed'::public.receipt_status)") &&
    sql.includes("r.receipt_status NOT IN ('pending'::public.receipt_status, 'rejected'::public.receipt_status)"),
    "Must strictly verify authoritative confirmation status on public.receipts"
  );
  assert.ok(
    sql.includes("v_dispatch.status != 'in_transit'::public.dispatch_status"),
    "Must require dispatch to be in_transit before transitioning to completed"
  );

  // Non-modification of unrelated business state
  assert.ok(!sql.includes("UPDATE public.inventory"), "Must NOT modify public.inventory");
  assert.ok(!sql.includes("UPDATE public.dispatch_orders"), "Must NOT modify public.dispatch_orders");
  assert.ok(!sql.includes("UPDATE public.dispatch_items"), "Must NOT modify public.dispatch_items");
  assert.ok(!sql.includes("UPDATE public.orders"), "Must NOT modify public.orders");
  assert.ok(!sql.includes("UPDATE public.receipts"), "Must NOT modify public.receipts");
});

// ==============================================================================
// 2. SIMULATED POSTGRESQL RPC ENGINE FOR TRIP PERSISTENCE
// ==============================================================================

class DispatchTripDatabaseSimulator {
  constructor() {
    this.dispatches = new Map();
    this.profiles = new Map();
    this.dispatchOrders = new Map(); // dispatchId -> array of { id, order_id, sequence, status }
    this.dispatchItems = new Map();  // dispatchId -> array of cargo
    this.receipts = new Map();       // `${dispatchId}_${orderId}` -> receipt object
    this.inventory = new Map();
    this.auditLogs = [];
  }

  seedDriver(driverId, role = "delivery_staff", isActive = true) {
    this.profiles.set(driverId, { id: driverId, role, is_active: isActive });
  }

  seedDispatch(dispatchId, { dispatchNumber, driverId, vehicleNumber, status = "scheduled", departureTime = "07:30 AM" }) {
    this.dispatches.set(dispatchId, {
      id: dispatchId,
      dispatch_number: dispatchNumber,
      delivery_staff_id: driverId,
      vehicle_number: vehicleNumber,
      departure_time: departureTime,
      delivery_notes: null,
      status,
      dispatched_at: status === "in_transit" ? new Date().toISOString() : null,
      completed_at: status === "completed" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });
  }

  seedCargoAndStops(dispatchId, stopOrderIds = ["ord-1", "ord-2"]) {
    const stops = stopOrderIds.map((orderId, idx) => ({
      id: `stop-${dispatchId}-${idx + 1}`,
      dispatch_id: dispatchId,
      order_id: orderId,
      sequence: idx + 1,
      status: "pending",
    }));
    this.dispatchOrders.set(dispatchId, stops);

    this.dispatchItems.set(dispatchId, [
      { id: "cargo-1", dispatch_id: dispatchId, product_id: "prod-1", quantity_loaded: 50 },
      { id: "cargo-2", dispatch_id: dispatchId, product_id: "prod-2", quantity_loaded: 76 },
    ]);
    this.inventory.set("prod-1", { onHand: 100, reserved: 50 });
  }

  recordReceipt(dispatchId, orderId, { confirmedBy = "user-rcpt-1", receiptStatus = "intact" } = {}) {
    this.receipts.set(`${dispatchId}_${orderId}`, {
      id: `rcpt-${dispatchId}-${orderId}`,
      dispatch_id: dispatchId,
      order_id: orderId,
      confirmed_by: confirmedBy,
      receipt_status: receiptStatus,
    });
    const stops = this.dispatchOrders.get(dispatchId) || [];
    const stop = stops.find((s) => s.order_id === orderId);
    if (stop && ["intact", "discrepancy", "confirmed"].includes(receiptStatus) && confirmedBy) {
      stop.status = "delivered";
    }
  }

  // Exact implementation of the hardened SQL RPC logic
  rpc_update_dispatch_trip(callerId, {
    p_dispatch_id,
    p_vehicle_number = null,
    p_departure_time = null,
    p_status = null,
    p_notes = null,
  }) {
    // 1. Authenticated check
    if (!callerId) {
      throw new Error("Unauthorized: Authentication required");
    }

    const callerProfile = this.profiles.get(callerId);
    if (!callerProfile || !callerProfile.is_active) {
      throw new Error("Unauthorized: Active user profile required");
    }

    const isSuperAdmin = callerProfile.role === "super_admin";
    if (!isSuperAdmin && callerProfile.role !== "delivery_staff") {
      throw new Error("Unauthorized: Delivery Staff or Super Admin authority required");
    }

    // 2. Lock dispatch row FOR UPDATE
    const dispatch = this.dispatches.get(p_dispatch_id);
    if (!dispatch) {
      throw new Error(`Dispatch ${p_dispatch_id} not found`);
    }

    // 3. Driver isolation
    const isAssignedDriver = dispatch.delivery_staff_id && dispatch.delivery_staff_id === callerId;
    if (!isSuperAdmin && !isAssignedDriver) {
      throw new Error("Unauthorized: Only assigned delivery staff or Super Admin can update dispatch trip");
    }

    // 4. Completed / Cancelled / Failed dispatch immutability
    if (dispatch.status === "completed") {
      throw new Error("Dispatch is already completed and cannot be modified");
    }
    if (dispatch.status === "cancelled") {
      throw new Error("Dispatch is cancelled and cannot be modified");
    }
    if (dispatch.status === "failed") {
      throw new Error("Dispatch has failed and cannot be modified");
    }

    // 5. Fleet vehicle reassignment requires Super Admin
    let newVehicle = null;
    if (p_vehicle_number && p_vehicle_number.trim().length > 0) {
      const trimmed = p_vehicle_number.trim();
      if (!dispatch.vehicle_number || trimmed !== dispatch.vehicle_number) {
        if (!isSuperAdmin) {
          throw new Error("Unauthorized: Fleet vehicle reassignment requires Super Admin authority");
        }
        newVehicle = trimmed;
      } else {
        newVehicle = dispatch.vehicle_number;
      }
    }

    // 6. Departure time handling (preserves if omitted/NULL; updates if non-empty string)
    let newDeparture = null;
    if (p_departure_time && p_departure_time.trim().length > 0) {
      newDeparture = p_departure_time.trim();
    }

    // 7. Notes handling (preserves if omitted/NULL; clears if empty string; updates if string)
    let updateNotes = false;
    let newNotes = null;
    if (p_notes !== null && p_notes !== undefined) {
      updateNotes = true;
      const trimmedNotes = p_notes.trim();
      newNotes = trimmedNotes.length > 0 ? trimmedNotes : null;
    }

    // 8. Status validation & lifecycle transition rules
    let targetStatus = null;
    if (p_status && p_status.trim().length > 0) {
      const normStatus = p_status.trim().toLowerCase().replace(/-/g, "_");

      if (normStatus === "delivered" || normStatus === "partially_delivered") {
        throw new Error(
          `Cannot set trip status to ${normStatus}: Stop delivery and receipt confirmation must occur via rpc_confirm_receipt`
        );
      }

      const validStatuses = ["draft", "scheduled", "loading", "in_transit", "completed", "failed", "cancelled"];
      if (!validStatuses.includes(normStatus)) {
        throw new Error(`Invalid dispatch trip status: ${p_status}`);
      }

      // Lifecycle Transition Rules:
      // Rule 8a: Forward progression and disallow invalid jumps / reverts
      if (dispatch.status === "draft" && !["draft", "scheduled", "cancelled"].includes(normStatus)) {
        throw new Error(`Invalid status transition: Cannot transition dispatch from draft directly to ${normStatus}`);
      }

      if (dispatch.status === "scheduled") {
        if (normStatus === "draft") {
          throw new Error("Invalid status transition: Cannot revert dispatch from scheduled back to draft");
        } else if (!["scheduled", "loading", "in_transit", "cancelled"].includes(normStatus)) {
          throw new Error(`Invalid status transition: Cannot transition dispatch from scheduled directly to ${normStatus}`);
        }
      }

      if (dispatch.status === "loading") {
        if (["draft", "scheduled"].includes(normStatus)) {
          throw new Error(`Invalid status transition: Cannot revert dispatch from loading back to ${normStatus}`);
        } else if (!["loading", "in_transit", "cancelled"].includes(normStatus)) {
          throw new Error(`Invalid status transition: Cannot transition dispatch from loading directly to ${normStatus}`);
        }
      }

      if (dispatch.status === "in_transit" && ["draft", "scheduled", "loading"].includes(normStatus)) {
        throw new Error(`Invalid status transition: Cannot revert dispatch in status in_transit back to ${normStatus}`);
      }

      // Rule 8b: Only Super Admin can cancel a dispatch trip
      if (normStatus === "cancelled" && !isSuperAdmin) {
        throw new Error("Unauthorized: Only Super Admin can cancel a dispatch trip");
      }

      // Rule 8c (COMPLETION INTEGRITY): Cannot mark completed unless in_transit AND all attached stops have confirmed receipts
      if (normStatus === "completed") {
        if (dispatch.status !== "in_transit") {
          throw new Error(`Invalid status transition: Cannot complete dispatch from status ${dispatch.status} (must be in_transit)`);
        }

        const stops = this.dispatchOrders.get(p_dispatch_id) || [];
        if (stops.length === 0) {
          throw new Error(`Cannot complete dispatch ${p_dispatch_id}: No route stops are attached to this dispatch trip`);
        }

        // Issue 2: Reject completion if any attached stops have failed
        const failedStops = stops.filter((s) => s.status === "failed");
        if (failedStops.length > 0) {
          throw new Error(
            `Cannot complete dispatch ${p_dispatch_id}: ${failedStops.length} stop(s) have failed. Failed stops must be resolved and reconciled before completion`
          );
        }

        // Issue 1: Verify authoritative confirmed receipt on public.receipts
        const unconfirmedStops = stops.filter((s) => {
          if (s.status !== "delivered") return true;
          const rcpt = this.receipts.get(`${p_dispatch_id}_${s.order_id}`);
          if (!rcpt) return true;
          if (!rcpt.confirmed_by) return true;
          const validStatuses = ["intact", "discrepancy", "confirmed"];
          if (!validStatuses.includes(rcpt.receipt_status)) return true;
          if (["pending", "rejected"].includes(rcpt.receipt_status)) return true;
          return false;
        });

        if (unconfirmedStops.length > 0) {
          throw new Error(
            `Cannot complete dispatch ${p_dispatch_id}: ${unconfirmedStops.length} stop(s) have not completed receipt confirmation and inventory reconciliation`
          );
        }
      }

      targetStatus = normStatus;
    }

    // 9. Execute update
    dispatch.vehicle_number = newVehicle || dispatch.vehicle_number;
    dispatch.departure_time = newDeparture || dispatch.departure_time;
    if (updateNotes) {
      dispatch.delivery_notes = newNotes;
    }
    dispatch.status = targetStatus || dispatch.status;
    if (targetStatus === "in_transit" && !dispatch.dispatched_at) {
      dispatch.dispatched_at = new Date().toISOString();
    }
    if (targetStatus === "completed" && !dispatch.completed_at) {
      dispatch.completed_at = new Date().toISOString();
    }
    dispatch.updated_at = new Date().toISOString();

    // 10. Audit log
    this.auditLogs.push({
      actor_id: callerId,
      action: "UPDATE_DISPATCH_TRIP",
      entity_type: "dispatch",
      entity_id: p_dispatch_id,
      details: {
        dispatch_number: dispatch.dispatch_number,
        previous_status: dispatch.status,
        updated_status: targetStatus || dispatch.status,
        vehicle_number: dispatch.vehicle_number,
        departure_time: dispatch.departure_time,
        delivery_notes: dispatch.delivery_notes,
      },
    });

    return {
      success: true,
      dispatch_id: p_dispatch_id,
      dispatch_number: dispatch.dispatch_number,
      manifest_number: `DSP-VRV-${dispatch.dispatch_number}`,
      status: dispatch.status,
      vehicle_number: dispatch.vehicle_number,
      departure_time: dispatch.departure_time,
      delivery_notes: dispatch.delivery_notes,
      updated_at: dispatch.updated_at,
    };
  }
}

// ==============================================================================
// 3. UNIT & INTEGRATION TEST SCENARIOS
// ==============================================================================

test("2. Unauthenticated caller is rejected by rpc_update_dispatch_trip", () => {
  const db = new DispatchTripDatabaseSimulator();
  db.seedDispatch("dsp-1", { dispatchNumber: 1001, driverId: "driver-1", vehicleNumber: "KL-08-AX-4412" });

  assert.throws(
    () => db.rpc_update_dispatch_trip(null, { p_dispatch_id: "dsp-1", p_departure_time: "08:00 AM" }),
    /Unauthorized: Authentication required/
  );
});

test("3. Inactive or unknown profile is rejected", () => {
  const db = new DispatchTripDatabaseSimulator();
  db.seedDriver("driver-inactive", "delivery_staff", false);
  db.seedDispatch("dsp-1", { dispatchNumber: 1001, driverId: "driver-inactive", vehicleNumber: "KL-08-AX-4412" });

  assert.throws(
    () => db.rpc_update_dispatch_trip("driver-inactive", { p_dispatch_id: "dsp-1", p_departure_time: "08:00 AM" }),
    /Unauthorized: Active user profile required/
  );
});

test("4. Unknown dispatch UUID is rejected by rpc_update_dispatch_trip", () => {
  const db = new DispatchTripDatabaseSimulator();
  db.seedDriver("driver-1", "delivery_staff");

  assert.throws(
    () => db.rpc_update_dispatch_trip("driver-1", { p_dispatch_id: "nonexistent-dsp", p_departure_time: "08:00 AM" }),
    /Dispatch nonexistent-dsp not found/
  );
});

test("5. Authorized assigned driver can update departure time, notes, and progress status", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";
  const dispatchId = "dsp-1003";

  db.seedDriver(driverId, "delivery_staff");
  db.seedDispatch(dispatchId, {
    dispatchNumber: 1003,
    driverId,
    vehicleNumber: "KL-08-AX-4412",
    status: "scheduled",
    departureTime: "07:30 AM",
  });

  const res = db.rpc_update_dispatch_trip(driverId, {
    p_dispatch_id: dispatchId,
    p_departure_time: "08:15 AM",
    p_status: "in-transit",
    p_notes: "Temperature verified at -18.4°C before departure",
  });

  assert.equal(res.success, true);
  assert.equal(res.manifest_number, "DSP-VRV-1003");
  assert.equal(res.status, "in_transit");
  assert.equal(res.departure_time, "08:15 AM");
  assert.equal(res.delivery_notes, "Temperature verified at -18.4°C before departure");
  assert.equal(res.vehicle_number, "KL-08-AX-4412");

  // Verify DB state persisted
  const updated = db.dispatches.get(dispatchId);
  assert.equal(updated.departure_time, "08:15 AM");
  assert.equal(updated.status, "in_transit");
  assert.ok(updated.dispatched_at, "dispatched_at timestamp must be recorded");

  // Verify audit log
  assert.equal(db.auditLogs.length, 1);
  assert.equal(db.auditLogs[0].action, "UPDATE_DISPATCH_TRIP");
});

test("6. Unauthorized driver cannot update another driver's dispatch trip (Driver Isolation)", () => {
  const db = new DispatchTripDatabaseSimulator();
  db.seedDriver("driver-1", "delivery_staff");
  db.seedDriver("driver-2", "delivery_staff");
  db.seedDispatch("dsp-1003", {
    dispatchNumber: 1003,
    driverId: "driver-1",
    vehicleNumber: "KL-08-AX-4412",
  });

  assert.throws(
    () => db.rpc_update_dispatch_trip("driver-2", { p_dispatch_id: "dsp-1003", p_status: "in-transit" }),
    /Unauthorized: Only assigned delivery staff or Super Admin can update dispatch trip/
  );
});

test("7. Delivery staff cannot reassign fleet vehicles", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";
  db.seedDriver(driverId, "delivery_staff");
  db.seedDispatch("dsp-1003", {
    dispatchNumber: 1003,
    driverId,
    vehicleNumber: "KL-08-AX-4412",
  });

  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, {
      p_dispatch_id: "dsp-1003",
      p_vehicle_number: "KL-08-BY-8821 (Refrigerated Truck)",
    }),
    /Unauthorized: Fleet vehicle reassignment requires Super Admin authority/
  );
});

test("8. Super Admin can reassign fleet vehicles and update any dispatch", () => {
  const db = new DispatchTripDatabaseSimulator();
  const adminId = "admin-1";
  db.seedDriver(adminId, "super_admin");
  db.seedDispatch("dsp-1003", {
    dispatchNumber: 1003,
    driverId: "driver-1",
    vehicleNumber: "KL-08-AX-4412",
  });

  const res = db.rpc_update_dispatch_trip(adminId, {
    p_dispatch_id: "dsp-1003",
    p_vehicle_number: "KL-08-BY-8821 (Refrigerated Truck)",
    p_notes: "Reassigned to heavier refrigerated vehicle by central logistics",
  });

  assert.equal(res.success, true);
  assert.equal(res.vehicle_number, "KL-08-BY-8821 (Refrigerated Truck)");
  assert.equal(res.delivery_notes, "Reassigned to heavier refrigerated vehicle by central logistics");
});

test("9. Completed dispatches are immutable and reject modifications", () => {
  const db = new DispatchTripDatabaseSimulator();
  const adminId = "admin-1";
  db.seedDriver(adminId, "super_admin");
  db.seedDispatch("dsp-1003", {
    dispatchNumber: 1003,
    driverId: "driver-1",
    vehicleNumber: "KL-08-AX-4412",
    status: "completed",
  });

  assert.throws(
    () => db.rpc_update_dispatch_trip(adminId, { p_dispatch_id: "dsp-1003", p_status: "in-transit" }),
    /Dispatch is already completed and cannot be modified/
  );
});

test("10. Invalid dispatch trip status strings are rejected", () => {
  const db = new DispatchTripDatabaseSimulator();
  const adminId = "admin-1";
  db.seedDriver(adminId, "super_admin");
  db.seedDispatch("dsp-1003", { dispatchNumber: 1003, driverId: "driver-1", vehicleNumber: "KL-08-AX-4412" });

  assert.throws(
    () => db.rpc_update_dispatch_trip(adminId, { p_dispatch_id: "dsp-1003", p_status: "hyperspace" }),
    /Invalid dispatch trip status: hyperspace/
  );
});

test("11. Direct setting of delivered or partially_delivered status on trip header is strictly rejected", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";
  db.seedDriver(driverId, "delivery_staff");
  db.seedDispatch("dsp-1003", { dispatchNumber: 1003, driverId, vehicleNumber: "KL-08-AX-4412" });

  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: "dsp-1003", p_status: "delivered" }),
    /Cannot set trip status to delivered: Stop delivery and receipt confirmation must occur via rpc_confirm_receipt/
  );

  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: "dsp-1003", p_status: "partially-delivered" }),
    /Cannot set trip status to partially_delivered: Stop delivery and receipt confirmation must occur via rpc_confirm_receipt/
  );
});

test("12. Completion integrity: Attempting to complete a dispatch with unconfirmed stops is rejected", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";
  const dispatchId = "dsp-1003";

  db.seedDriver(driverId, "delivery_staff");
  db.seedDispatch(dispatchId, { dispatchNumber: 1003, driverId, vehicleNumber: "KL-08-AX-4412", status: "in_transit" });
  db.seedCargoAndStops(dispatchId, ["ord-10048", "ord-10049"]);

  // Neither stop has a confirmed receipt in public.receipts!
  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: dispatchId, p_status: "completed" }),
    /Cannot complete dispatch dsp-1003: 2 stop\(s\) have not completed receipt confirmation and inventory reconciliation/
  );

  // Confirm receipt for ord-10048 only (ord-10049 still unconfirmed)
  db.recordReceipt(dispatchId, "ord-10048");

  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: dispatchId, p_status: "completed" }),
    /Cannot complete dispatch dsp-1003: 1 stop\(s\) have not completed receipt confirmation and inventory reconciliation/
  );

  // Confirm receipt for second stop ord-10049
  db.recordReceipt(dispatchId, "ord-10049");

  // Now completion MUST succeed!
  const res = db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: dispatchId, p_status: "completed" });
  assert.equal(res.success, true);
  assert.equal(res.status, "completed");
  assert.ok(db.dispatches.get(dispatchId).completed_at, "completed_at must be set");
});

test("13. Reverting an in-transit dispatch back to scheduled or loading is rejected", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";
  const dispatchId = "dsp-1003";

  db.seedDriver(driverId, "delivery_staff");
  db.seedDispatch(dispatchId, { dispatchNumber: 1003, driverId, vehicleNumber: "KL-08-AX-4412", status: "in_transit" });

  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: dispatchId, p_status: "scheduled" }),
    /Invalid status transition: Cannot revert dispatch in status in_transit back to scheduled/
  );

  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: dispatchId, p_status: "loading" }),
    /Invalid status transition: Cannot revert dispatch in status in_transit back to loading/
  );
});

test("14. Trip cancellation is restricted strictly to Super Admin", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";
  const adminId = "admin-1";
  const dispatchId = "dsp-1003";

  db.seedDriver(driverId, "delivery_staff");
  db.seedDriver(adminId, "super_admin");
  db.seedDispatch(dispatchId, { dispatchNumber: 1003, driverId, vehicleNumber: "KL-08-AX-4412", status: "scheduled" });

  // Driver cannot cancel
  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: dispatchId, p_status: "cancelled" }),
    /Unauthorized: Only Super Admin can cancel a dispatch trip/
  );

  // Super Admin can cancel
  const res = db.rpc_update_dispatch_trip(adminId, { p_dispatch_id: dispatchId, p_status: "cancelled" });
  assert.equal(res.success, true);
  assert.equal(res.status, "cancelled");
});

test("15. Optional field semantics: null preserves, empty string clears notes", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";
  const dispatchId = "dsp-1003";

  db.seedDriver(driverId, "delivery_staff");
  db.seedDispatch(dispatchId, { dispatchNumber: 1003, driverId, vehicleNumber: "KL-08-AX-4412", departureTime: "07:30 AM" });
  db.dispatches.get(dispatchId).delivery_notes = "Initial instructions";

  // Pass null for notes and departure time -> preserves existing values
  const res1 = db.rpc_update_dispatch_trip(driverId, {
    p_dispatch_id: dispatchId,
    p_departure_time: null,
    p_notes: null,
  });
  assert.equal(res1.departure_time, "07:30 AM");
  assert.equal(res1.delivery_notes, "Initial instructions");

  // Pass empty string for notes -> clears notes to null
  const res2 = db.rpc_update_dispatch_trip(driverId, {
    p_dispatch_id: dispatchId,
    p_notes: "   ",
  });
  assert.equal(res2.delivery_notes, null, "Empty string should clear delivery notes to null");
});

test("16. Trip update leaves stops, cargo, orders, and inventory completely untouched", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";
  const dispatchId = "dsp-1003";

  db.seedDriver(driverId, "delivery_staff");
  db.seedDispatch(dispatchId, { dispatchNumber: 1003, driverId, vehicleNumber: "KL-08-AX-4412" });
  db.seedCargoAndStops(dispatchId);

  // Snapshot before
  const stopsBefore = JSON.stringify(db.dispatchOrders.get(dispatchId));
  const cargoBefore = JSON.stringify(db.dispatchItems.get(dispatchId));
  const inventoryBefore = JSON.stringify(db.inventory.get("prod-1"));

  // Mutate trip header
  db.rpc_update_dispatch_trip(driverId, {
    p_dispatch_id: dispatchId,
    p_departure_time: "08:30 AM",
    p_status: "in-transit",
    p_notes: "Clean route start",
  });

  // Verify non-modification
  assert.equal(JSON.stringify(db.dispatchOrders.get(dispatchId)), stopsBefore, "Route stops must remain unchanged");
  assert.equal(JSON.stringify(db.dispatchItems.get(dispatchId)), cargoBefore, "Cargo items must remain unchanged");
  assert.equal(JSON.stringify(db.inventory.get("prod-1")), inventoryBefore, "Inventory balances must remain unchanged");
});

test("17. Server action dispatches.ts invokes rpc_update_dispatch_trip with exact parameters", () => {
  const dispatchesSource = fs.readFileSync(path.resolve("src/lib/actions/dispatches.ts"), "utf8");

  // Check RPC invocation
  assert.match(
    dispatchesSource,
    /supabase\.rpc\(\s*["']rpc_update_dispatch_trip["']\s*,\s*\{/,
    "updateDispatchTripAction must call supabase.rpc('rpc_update_dispatch_trip')"
  );

  // Parameter names conformance
  assert.match(dispatchesSource, /p_dispatch_id:\s*input\.dispatchId/, "Must pass p_dispatch_id");
  assert.match(dispatchesSource, /p_vehicle_number:/, "Must pass p_vehicle_number");
  assert.match(dispatchesSource, /p_departure_time:/, "Must pass p_departure_time");
  assert.match(dispatchesSource, /p_status:/, "Must pass p_status");
  assert.match(dispatchesSource, /p_notes:/, "Must pass p_notes");

  // Error handling conformance
  assert.match(
    dispatchesSource,
    /if\s*\(!rpcError\s*&&\s*rpcData\s*&&\s*\(rpcData\s+as\s+any\)\.success\)/,
    "Must handle rpcData.success"
  );
  assert.match(
    dispatchesSource,
    /if\s*\(rpcError\s*&&\s*rpcError\.message\s*&&\s*!rpcError\.message\.includes\(["']does not exist["']\)\)/,
    "Must catch and return descriptive RPC errors"
  );
});

test("18. database.types.ts contains rpc_update_dispatch_trip type contract", () => {
  const typesSource = fs.readFileSync(path.resolve("src/lib/supabase/database.types.ts"), "utf8");

  assert.match(
    typesSource,
    /rpc_update_dispatch_trip:\s*\{/,
    "database.types.ts must define rpc_update_dispatch_trip"
  );
  assert.match(
    typesSource,
    /p_dispatch_id:\s*string/,
    "Args must include p_dispatch_id"
  );
  assert.match(
    typesSource,
    /manifest_number:\s*string/,
    "Returns must include manifest_number"
  );
});

// ==============================================================================
// 3. PHASE 5B.2: FOCUSED RECEIPT CONFIRMATION & LIFECYCLE TESTS (SIMULATED)
// ==============================================================================

test("19. Unconfirmed receipt with 'pending' status does not satisfy completion guard", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";
  const dispatchId = "dsp-2001";

  db.seedDriver(driverId, "delivery_staff");
  db.seedDispatch(dispatchId, { dispatchNumber: 2001, driverId, vehicleNumber: "KL-08-AX-4412", status: "in_transit" });
  db.seedCargoAndStops(dispatchId, ["ord-501"]);

  // Record a receipt with status 'pending' (provisional/unconfirmed)
  db.recordReceipt(dispatchId, "ord-501", { confirmedBy: "staff-1", receiptStatus: "pending" });

  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: dispatchId, p_status: "completed" }),
    /Cannot complete dispatch dsp-2001: 1 stop\(s\) have not completed receipt confirmation and inventory reconciliation/
  );
});

test("20. Unconfirmed receipt with 'rejected' status does not satisfy completion guard", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";
  const dispatchId = "dsp-2002";

  db.seedDriver(driverId, "delivery_staff");
  db.seedDispatch(dispatchId, { dispatchNumber: 2002, driverId, vehicleNumber: "KL-08-AX-4412", status: "in_transit" });
  db.seedCargoAndStops(dispatchId, ["ord-502"]);

  // Record a receipt with status 'rejected'
  db.recordReceipt(dispatchId, "ord-502", { confirmedBy: "staff-1", receiptStatus: "rejected" });

  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: dispatchId, p_status: "completed" }),
    /Cannot complete dispatch dsp-2002: 1 stop\(s\) have not completed receipt confirmation and inventory reconciliation/
  );
});

test("21. Receipt row lacking confirmed_by authority does not satisfy completion guard", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";
  const dispatchId = "dsp-2003";

  db.seedDriver(driverId, "delivery_staff");
  db.seedDispatch(dispatchId, { dispatchNumber: 2003, driverId, vehicleNumber: "KL-08-AX-4412", status: "in_transit" });
  db.seedCargoAndStops(dispatchId, ["ord-503"]);

  // Row exists in receipts table but confirmed_by is null
  db.recordReceipt(dispatchId, "ord-503", { confirmedBy: null, receiptStatus: "intact" });

  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: dispatchId, p_status: "completed" }),
    /Cannot complete dispatch dsp-2003: 1 stop\(s\) have not completed receipt confirmation and inventory reconciliation/
  );
});

test("22. Confirmed receipt with 'discrepancy' status satisfies receipt check and permits completion", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";
  const dispatchId = "dsp-2004";

  db.seedDriver(driverId, "delivery_staff");
  db.seedDispatch(dispatchId, { dispatchNumber: 2004, driverId, vehicleNumber: "KL-08-AX-4412", status: "in_transit" });
  db.seedCargoAndStops(dispatchId, ["ord-504"]);

  // Authoritatively confirmed receipt with discrepancy
  db.recordReceipt(dispatchId, "ord-504", { confirmedBy: "staff-1", receiptStatus: "discrepancy" });

  const res = db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: dispatchId, p_status: "completed" });
  assert.equal(res.success, true);
  assert.equal(res.status, "completed");
  assert.ok(db.dispatches.get(dispatchId).completed_at);
});

test("23. Failed-stop policy: Stops with status 'failed' reject completion while unresolved", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";
  const dispatchId = "dsp-2005";

  db.seedDriver(driverId, "delivery_staff");
  db.seedDispatch(dispatchId, { dispatchNumber: 2005, driverId, vehicleNumber: "KL-08-AX-4412", status: "in_transit" });
  db.seedCargoAndStops(dispatchId, ["ord-505a", "ord-505b"]);

  // First stop confirmed
  db.recordReceipt(dispatchId, "ord-505a", { confirmedBy: "staff-1", receiptStatus: "intact" });

  // Second stop marked failed
  const stops = db.dispatchOrders.get(dispatchId);
  stops[1].status = "failed";

  // Attempting to complete must be rejected due to unresolved failed stops
  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: dispatchId, p_status: "completed" }),
    /Cannot complete dispatch dsp-2005: 1 stop\(s\) have failed\. Failed stops must be resolved and reconciled before completion/
  );
});

test("24. Trip failure lifecycle: Dispatch can transition to 'failed', and failed dispatches are terminal", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";
  const dispatchId = "dsp-2006";

  db.seedDriver(driverId, "delivery_staff");
  db.seedDispatch(dispatchId, { dispatchNumber: 2006, driverId, vehicleNumber: "KL-08-AX-4412", status: "in_transit" });
  db.seedCargoAndStops(dispatchId, ["ord-506"]);

  // Transition in_transit trip to failed
  const res = db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: dispatchId, p_status: "failed" });
  assert.equal(res.success, true);
  assert.equal(res.status, "failed");

  // Subsequent updates on failed trip must be rejected
  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: dispatchId, p_status: "completed" }),
    /Dispatch has failed and cannot be modified/
  );
});

test("25. Invalid forward skips are strictly rejected", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";

  db.seedDriver(driverId, "delivery_staff");

  // Skip scheduled -> completed
  db.seedDispatch("dsp-2007", { dispatchNumber: 2007, driverId, status: "scheduled" });
  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: "dsp-2007", p_status: "completed" }),
    /Invalid status transition: Cannot transition dispatch from scheduled directly to completed/
  );

  // Skip loading -> completed
  db.seedDispatch("dsp-2008", { dispatchNumber: 2008, driverId, status: "loading" });
  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: "dsp-2008", p_status: "completed" }),
    /Invalid status transition: Cannot transition dispatch from loading directly to completed/
  );

  // Skip draft -> in_transit
  db.seedDispatch("dsp-2009", { dispatchNumber: 2009, driverId, status: "draft" });
  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: "dsp-2009", p_status: "in_transit" }),
    /Invalid status transition: Cannot transition dispatch from draft directly to in_transit/
  );
});

test("26. Invalid backward reverts are strictly rejected", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";

  db.seedDriver(driverId, "delivery_staff");

  // Scheduled -> draft
  db.seedDispatch("dsp-2010", { dispatchNumber: 2010, driverId, status: "scheduled" });
  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: "dsp-2010", p_status: "draft" }),
    /Invalid status transition: Cannot revert dispatch from scheduled back to draft/
  );

  // Loading -> scheduled
  db.seedDispatch("dsp-2011", { dispatchNumber: 2011, driverId, status: "loading" });
  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: "dsp-2011", p_status: "scheduled" }),
    /Invalid status transition: Cannot revert dispatch from loading back to scheduled/
  );

  // Loading -> draft
  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: "dsp-2011", p_status: "draft" }),
    /Invalid status transition: Cannot revert dispatch from loading back to draft/
  );
});

test("27. Terminal states (completed, cancelled, failed) reject all mutations and transitions", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";

  db.seedDriver(driverId, "delivery_staff");

  // Completed
  db.seedDispatch("dsp-2012", { dispatchNumber: 2012, driverId, status: "completed" });
  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: "dsp-2012", p_status: "in_transit" }),
    /Dispatch is already completed and cannot be modified/
  );

  // Cancelled
  db.seedDispatch("dsp-2013", { dispatchNumber: 2013, driverId, status: "cancelled" });
  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: "dsp-2013", p_status: "scheduled" }),
    /Dispatch is cancelled and cannot be modified/
  );

  // Failed
  db.seedDispatch("dsp-2014", { dispatchNumber: 2014, driverId, status: "failed" });
  assert.throws(
    () => db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: "dsp-2014", p_status: "in_transit" }),
    /Dispatch has failed and cannot be modified/
  );
});

test("28. Zero unintended changes across stock, cargo, route stops, orders, and receipts under invalid transitions", () => {
  const db = new DispatchTripDatabaseSimulator();
  const driverId = "driver-1";
  const dispatchId = "dsp-2015";

  db.seedDriver(driverId, "delivery_staff");
  db.seedDispatch(dispatchId, { dispatchNumber: 2015, driverId, vehicleNumber: "KL-08-AX-4412", status: "in_transit" });
  db.seedCargoAndStops(dispatchId, ["ord-515"]);

  // Record baseline snapshots
  const stopsSnapshot = JSON.stringify(db.dispatchOrders.get(dispatchId));
  const cargoSnapshot = JSON.stringify(db.dispatchItems.get(dispatchId));
  const inventorySnapshot = JSON.stringify(db.inventory.get("prod-1"));
  const receiptsSnapshot = JSON.stringify([...db.receipts.entries()]);

  // Execute rejected transition (skipping receipt confirmation)
  assert.throws(() => {
    db.rpc_update_dispatch_trip(driverId, { p_dispatch_id: dispatchId, p_status: "completed" });
  });

  // Verify snapshots are completely untouched
  assert.equal(JSON.stringify(db.dispatchOrders.get(dispatchId)), stopsSnapshot, "Stops must not change");
  assert.equal(JSON.stringify(db.dispatchItems.get(dispatchId)), cargoSnapshot, "Cargo must not change");
  assert.equal(JSON.stringify(db.inventory.get("prod-1")), inventorySnapshot, "Inventory must not change");
  assert.equal(JSON.stringify([...db.receipts.entries()]), receiptsSnapshot, "Receipts must not change");
});

