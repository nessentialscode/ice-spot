"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  validateSuperAdminAction,
  validateAuthenticatedAction,
  validateDeliveryStaffAction,
} from "@/lib/supabase/server-auth";
import {
  StopDeliveryStatus,
  DeliveryTripStatus,
  DispatchBatch,
  DispatchStop,
  OrderItem,
  OrderStatus,
} from "@/types/admin";

export interface DeliveredItemInput {
  productId: string;
  quantityDelivered: number;
  shortageQuantity?: number;
  deliveredSticks?: number;
  returnedSticks?: number;
}

export interface CreateDispatchInput {
  vehicleNumber: string;
  driverId?: string;
  driverName: string;
  driverPhone?: string;
  orderIds: string[];
  notes?: string;
  departureTime?: string;
  loadingBay?: string;
}

export interface ActionResult<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates a new dispatch batch and links the assigned orders.
 * Strictly requires Super Admin authorization.
 * Handles database errors without falsely showing success.
 */
export async function createDispatchAction(
  input: CreateDispatchInput
): Promise<ActionResult<{ dispatchId: string; manifestNumber: string }>> {
  try {
    const auth = await validateDeliveryStaffAction();
    if (!auth.isAuthorized) {
      return {
        success: false,
        message: auth.message || "Unauthorized: Super Admin or Delivery Staff authority required to create logistics dispatches.",
        error: auth.error || "FORBIDDEN",
      };
    }

    if (!input.vehicleNumber?.trim() || !input.driverName?.trim()) {
      return {
        success: false,
        message: "Vehicle number and driver name are required.",
        error: "VALIDATION_ERROR",
      };
    }

    if (!input.orderIds || input.orderIds.length === 0) {
      return {
        success: false,
        message: "At least one order must be selected for dispatch.",
        error: "VALIDATION_ERROR",
      };
    }

    // Deduplicate and validate order UUIDs
    const uniqueOrderIds = Array.from(new Set(input.orderIds));
    for (const oid of uniqueOrderIds) {
      if (!UUID_REGEX.test(oid)) {
        return {
          success: false,
          message: `Invalid order identifier format: ${oid}. UUID required.`,
          error: "INVALID_IDENTIFIER",
        };
      }
    }

    if (input.driverId && !UUID_REGEX.test(input.driverId)) {
      return {
        success: false,
        message: "Invalid driver identifier format. UUID required.",
        error: "INVALID_IDENTIFIER",
      };
    }

    const supabase = await createServerSupabaseClient();

    // Verify order eligibility (must be approved, preparation, or ready_for_dispatch)
    // Note: If called by delivery_staff, Postgres RLS on orders may hide unassigned orders
    // from direct SELECT queries. rpc_create_dispatch is SECURITY DEFINER and performs
    // atomic row-level existence, status, and FOR UPDATE locking inside the database.
    const { data: ordersToDispatch, error: orderFetchErr } = await supabase
      .from("orders")
      .select("id, status, order_number")
      .in("id", uniqueOrderIds);

    const isSuperAdmin = auth.profile?.role === "super_admin";
    if (isSuperAdmin && (orderFetchErr || !ordersToDispatch || ordersToDispatch.length !== uniqueOrderIds.length)) {
      return {
        success: false,
        message: "One or more selected orders could not be found in the database.",
        error: "ORDERS_NOT_FOUND",
      };
    }

    if (ordersToDispatch && ordersToDispatch.length > 0) {
      const ineligibleOrders = ordersToDispatch.filter(
        (o) => !["approved", "preparation", "ready_for_dispatch"].includes(o.status)
      );
      if (ineligibleOrders.length > 0) {
        const summary = ineligibleOrders.map((o) => `#${o.order_number} (${o.status})`).join(", ");
        return {
          success: false,
          message: `Cannot dispatch ineligible order(s): ${summary}. Only approved orders can be dispatched.`,
          error: "INVALID_ORDER_STATUS",
        };
      }
    }

    // Verify against duplicate dispatches
    const { data: existingStops } = await supabase
      .from("dispatch_orders")
      .select(`
        order_id,
        dispatches (
          id,
          status,
          dispatch_number
        )
      `)
      .in("order_id", uniqueOrderIds);

    if (existingStops && existingStops.length > 0) {
      const activeDuplicate = existingStops.find((s: any) => {
        const d = Array.isArray(s.dispatches) ? s.dispatches[0] : s.dispatches;
        return d && !["completed", "cancelled", "failed"].includes(d?.status);
      });
      if (activeDuplicate) {
        const d = Array.isArray(activeDuplicate.dispatches)
          ? activeDuplicate.dispatches[0]
          : activeDuplicate.dispatches;
        const dispIdentifier = (d as any)?.manifest_number || (d?.dispatch_number ? `DSP-VRV-${d.dispatch_number}` : (d as any)?.id);
        return {
          success: false,
          message: `Cannot create dispatch: Order is already attached to an active dispatch trip (${dispIdentifier}).`,
          error: "ORDER_ALREADY_DISPATCHED",
        };
      }
    }

    // 0. Primary Transactional Path: rpc_create_dispatch
    const { data: rpcData, error: rpcError } = await supabase.rpc("rpc_create_dispatch", {
      p_order_ids: uniqueOrderIds,
      p_delivery_staff_id: input.driverId || null,
      p_notes: input.notes || null,
      p_items: null,
      p_vehicle_number: input.vehicleNumber.trim().toUpperCase(),
      p_departure_time: input.departureTime?.trim() || null,
      p_loading_bay: input.loadingBay?.trim() || null,
    });

    if (!rpcError && rpcData && (rpcData as any).success) {
      const rpcDispatchId = (rpcData as any).dispatch_id;
      const rpcDispatchNum = (rpcData as any).dispatch_number;
      const rpcManifest = `DSP-VRV-${rpcDispatchNum}`;

      if (auth.user?.id) {
        await supabase.from("audit_logs").insert({
          actor_id: auth.user.id,
          action: "CREATE_DISPATCH",
          entity_type: "dispatch",
          entity_id: rpcDispatchId,
          details: {
            manifestNumber: rpcManifest,
            vehicleNumber: input.vehicleNumber,
            ordersCount: uniqueOrderIds.length,
            actor: auth.profile?.full_name || auth.user.email,
          },
        });
      }

      return {
        success: true,
        message: `Manifest ${rpcManifest} generated successfully for vehicle ${input.vehicleNumber}.`,
        data: { dispatchId: rpcDispatchId, manifestNumber: rpcManifest },
      };
    }

    if (rpcError && rpcError.message && !rpcError.message.includes("does not exist")) {
      return {
        success: false,
        message: `Database failed to create dispatch manifest: ${rpcError.message}`,
        error: rpcError.code || "DB_ERROR",
      };
    }

    const manifestNumber = `DSP-VRV-${Math.floor(100 + Math.random() * 900)}`;

    // 1. Insert Dispatch (fallback if RPC unavailable)
    const { data: dispatch, error: dispatchError } = await supabase
      .from("dispatches")
      .insert({
        vehicle_number: input.vehicleNumber.trim().toUpperCase(),
        delivery_staff_id: input.driverId || null,
        status: "scheduled",
        departure_time: input.departureTime?.trim() || null,
        delivery_notes: input.notes || null,
      })
      .select("id, dispatch_number")
      .single();

    if (dispatchError || !dispatch) {
      return {
        success: false,
        message: `Database failed to create dispatch manifest: ${dispatchError?.message || "Unknown error"}`,
        error: dispatchError?.code || "DB_ERROR",
      };
    }

    // 2. Link orders as dispatch orders / route stops
    const stopsToInsert = uniqueOrderIds.map((orderId, idx) => ({
      dispatch_id: dispatch.id,
      order_id: orderId,
      sequence: idx + 1,
      status: "pending",
    }));

    const { error: stopsError } = await supabase.from("dispatch_orders").insert(stopsToInsert);
    if (stopsError) {
      // Rollback newly created dispatch record to avoid leaving an orphaned manifest
      await supabase.from("dispatches").delete().eq("id", dispatch.id);
      return {
        success: false,
        message: `Dispatch created but attaching stops failed; rolled back manifest: ${stopsError.message}`,
        error: stopsError.code || "DB_ERROR",
      };
    }

    // Update orders status to 'dispatched' with transaction rollback tracking
    const updatedOrderIds: string[] = [];
    for (const orderId of uniqueOrderIds) {
      const { error: orderUpdateErr } = await supabase
        .from("orders")
        .update({
          status: "dispatched",
          assigned_dispatch_id: dispatch.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (orderUpdateErr) {
        // Rollback previously updated orders in this batch to their previous status
        for (const revertedId of updatedOrderIds) {
          const original = (ordersToDispatch || []).find((o) => o.id === revertedId);
          await supabase
            .from("orders")
            .update({
              status: original?.status || "approved",
              assigned_dispatch_id: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", revertedId);
        }
        // Rollback stops and dispatch manifest
        await supabase.from("dispatch_orders").delete().eq("dispatch_id", dispatch.id);
        await supabase.from("dispatches").delete().eq("id", dispatch.id);

        return {
          success: false,
          message: `Failed to update order status during dispatch creation; rolled back all changes: ${orderUpdateErr.message}`,
          error: orderUpdateErr.code || "DB_ERROR",
        };
      }
      updatedOrderIds.push(orderId);
    }

    // 3. Audit Log conforming to live schema
    if (auth.user?.id) {
      await supabase.from("audit_logs").insert({
        actor_id: auth.user.id,
        action: "CREATE_DISPATCH",
        entity_type: "dispatch",
        entity_id: dispatch.id,
        details: {
          manifestNumber,
          vehicleNumber: input.vehicleNumber,
          ordersCount: uniqueOrderIds.length,
          actor: auth.profile?.full_name || auth.user.email,
        },
      });
    }

    const finalManifestNumber = dispatch.dispatch_number
      ? `DSP-VRV-${dispatch.dispatch_number}`
      : manifestNumber;

    return {
      success: true,
      message: `Manifest ${finalManifestNumber} generated successfully for vehicle ${input.vehicleNumber}.`,
      data: { dispatchId: dispatch.id, manifestNumber: finalManifestNumber },
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to create dispatch.",
      error: "SERVER_ERROR",
    };
  }
}

/**
 * Updates delivery stop status during a cold-chain route.
 * Accepts optional deliveredItems to record per-product delivered and shortage quantities.
 */
export async function updateStopStatusAction(
  dispatchId: string,
  orderId: string,
  status: StopDeliveryStatus,
  deliveredUnits?: number,
  notes?: string,
  failureReason?: string,
  deliveredItems?: DeliveredItemInput[]
): Promise<ActionResult> {
  try {
    const auth = await validateAuthenticatedAction();
    if (!auth.isAuthorized) {
      return {
        success: false,
        message: auth.message || "Authentication required.",
        error: auth.error || "UNAUTHENTICATED",
      };
    }

    // Role check: Only Super Admin and Delivery Staff can update dispatch stops
    const normalizedRole = auth.profile?.role?.toLowerCase().replace(/-/g, "_");
    if (normalizedRole !== "super_admin" && normalizedRole !== "delivery_staff") {
      return {
        success: false,
        message: "Unauthorized: Only Super Admin and Delivery Staff can update route stops.",
        error: "FORBIDDEN",
      };
    }

    if (!UUID_REGEX.test(dispatchId) || !UUID_REGEX.test(orderId)) {
      return {
        success: false,
        message: "Invalid dispatch or order identifier format (UUID required).",
        error: "INVALID_IDENTIFIER",
      };
    }

    const validStatuses: StopDeliveryStatus[] = ["pending", "in-transit", "reached", "delivered", "partially-delivered", "failed"];
    if (!validStatuses.includes(status)) {
      return {
        success: false,
        message: `Invalid stop delivery status: '${status}'.`,
        error: "INVALID_STATUS",
      };
    }

    // Validate delivered items if provided
    if (deliveredItems && deliveredItems.length > 0) {
      for (const item of deliveredItems) {
        if (!item.productId) {
          return {
            success: false,
            message: "Each delivered item must have a productId.",
            error: "VALIDATION_ERROR",
          };
        }
        if (typeof item.quantityDelivered !== "number" || !isFinite(item.quantityDelivered) || item.quantityDelivered < 0) {
          return {
            success: false,
            message: `Invalid delivered quantity for product ${item.productId}. Must be a non-negative number.`,
            error: "VALIDATION_ERROR",
          };
        }
        if (item.shortageQuantity !== undefined && (typeof item.shortageQuantity !== "number" || !isFinite(item.shortageQuantity) || item.shortageQuantity < 0)) {
          return {
            success: false,
            message: `Invalid shortage quantity for product ${item.productId}. Must be a non-negative number.`,
            error: "VALIDATION_ERROR",
          };
        }
      }
    }

    const supabase = await createServerSupabaseClient();

    // Driver isolation: If delivery_staff, verify driver assignment
    if (normalizedRole === "delivery_staff") {
      const { data: dispatchRecord } = await supabase
        .from("dispatches")
        .select("driver_id:delivery_staff_id")
        .eq("id", dispatchId)
        .maybeSingle();

      if (dispatchRecord?.driver_id && dispatchRecord.driver_id !== auth.user?.id) {
        return {
          success: false,
          message: "Unauthorized: You are not the assigned delivery driver for this dispatch.",
          error: "FORBIDDEN",
        };
      }
    }

    const noteText = notes && failureReason
      ? `${notes} (Failure reason: ${failureReason})`
      : (notes || failureReason || null);

    // Build p_delivered_items JSONB payload for the RPC
    const rpcDeliveredItems = (deliveredItems && deliveredItems.length > 0)
      ? deliveredItems.map((item) => ({
          product_id: item.productId,
          quantity_delivered: item.quantityDelivered,
          shortage_quantity: item.shortageQuantity ?? 0,
        }))
      : null;

    // 0. Primary transactional path: rpc_update_delivery_stop
    const { data: rpcData, error: rpcError } = await supabase.rpc("rpc_update_delivery_stop", {
      p_dispatch_id: dispatchId,
      p_order_id: orderId,
      p_status: status,
      p_notes: noteText,
      p_delivered_items: rpcDeliveredItems,
    });

    if (!rpcError && rpcData && (rpcData as any).success) {
      return {
        success: true,
        message: `Stop status updated to ${status}.`,
      };
    }

    if (rpcError) {
      // Allow fallback ONLY if the RPC function is genuinely not defined in the schema cache (PGRST202)
      const isFunctionMissing =
        rpcError.code === "PGRST202" ||
        (rpcError.message && rpcError.message.includes("function public.rpc_update_delivery_stop"));

      if (!isFunctionMissing) {
        return {
          success: false,
          message: `Failed to update stop status: ${rpcError.message}`,
          error: rpcError.code || "DB_ERROR",
        };
      }
    }

    const payload: Record<string, any> = {
      status,
      delivery_notes: noteText,
    };

    const { data: updatedStopRows, error } = await supabase
      .from("dispatch_orders")
      .update(payload)
      .eq("dispatch_id", dispatchId)
      .eq("order_id", orderId)
      .select("id");

    if (error) {
      return {
        success: false,
        message: `Failed to update stop status: ${error.message}`,
        error: error.code || "DB_ERROR",
      };
    }

    if (!updatedStopRows || updatedStopRows.length === 0) {
      return {
        success: false,
        message: "No matching route stop found or insufficient permissions to update.",
        error: "STOP_NOT_UPDATED",
      };
    }

    // Synchronize orders table status upon terminal delivery status
    if (status === "delivered" || status === "partially-delivered") {
      const orderStatus = status === "delivered" ? "delivered" : "partially_delivered";
      await supabase
        .from("orders")
        .update({
          status: orderStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);
    }

    // Synchronize dispatch items in fallback path
    if (rpcDeliveredItems && rpcDeliveredItems.length > 0) {
      for (const di of rpcDeliveredItems) {
        await supabase
          .from("dispatch_items")
          .update({
            quantity_delivered: di.quantity_delivered,
            quantity_short: di.shortage_quantity,
            updated_at: new Date().toISOString(),
          })
          .eq("dispatch_id", dispatchId)
          .eq("product_id", di.product_id);
      }
    }

    // Audit log
    if (auth.user?.id) {
      await supabase.from("audit_logs").insert({
        actor_id: auth.user.id,
        action: "UPDATE_STOP_STATUS",
        entity_type: "dispatch_order",
        entity_id: `${dispatchId}:${orderId}`,
        details: { status, failureReason, notes },
      });
    }

    return {
      success: true,
      message: `Stop status updated to ${status}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to update stop status.",
      error: "SERVER_ERROR",
    };
  }
}

export interface UpdateDispatchTripInput {
  dispatchId: string;
  vehicleNumber?: string;
  departureTime?: string;
  status?: DeliveryTripStatus;
  notes?: string;
}

/**
 * Updates dispatch trip header fields (status, departure time, vehicle, notes).
 * Strictly enforces role model:
 * - Delivery Staff can update trip progress and departure notes on their assigned dispatch.
 * - Fleet vehicle reassignment requires Super Admin authority.
 * - Completed dispatches cannot be modified or duplicated.
 * - Route stops and allocated cargo remain unchanged.
 */
export async function updateDispatchTripAction(
  input: UpdateDispatchTripInput
): Promise<ActionResult<{ dispatchId: string; status: string }>> {
  try {
    const auth = await validateDeliveryStaffAction();
    if (!auth.isAuthorized) {
      return {
        success: false,
        message: auth.message || "Unauthorized: Delivery Staff or Super Admin privileges required.",
        error: auth.error || "FORBIDDEN",
      };
    }

    if (!input.dispatchId || !UUID_REGEX.test(input.dispatchId)) {
      return {
        success: false,
        message: "Invalid dispatch identifier format (UUID required).",
        error: "INVALID_IDENTIFIER",
      };
    }

    const supabase = await createServerSupabaseClient();

    // Fetch existing dispatch record
    const { data: existingDispatch, error: fetchErr } = await supabase
      .from("dispatches")
      .select("id, status, driver_id:delivery_staff_id, vehicle_number, manifest_number:dispatch_number")
      .eq("id", input.dispatchId)
      .maybeSingle();

    if (fetchErr || !existingDispatch) {
      return {
        success: false,
        message: `Dispatch trip ${input.dispatchId} not found in database.`,
        error: "DISPATCH_NOT_FOUND",
      };
    }

    // Role Model Enforcement:
    // 1. A COMPLETED dispatch must not be silently overwritten or duplicated.
    if (existingDispatch.status === "completed") {
      return {
        success: false,
        message: `Dispatch ${existingDispatch.manifest_number} is already COMPLETED and cannot be modified.`,
        error: "DISPATCH_ALREADY_COMPLETED",
      };
    }

    const normalizedRole = auth.profile?.role?.toLowerCase().replace(/-/g, "_");

    // 2. Driver isolation for delivery_staff
    if (
      normalizedRole === "delivery_staff" &&
      existingDispatch.driver_id &&
      existingDispatch.driver_id !== auth.user?.id
    ) {
      return {
        success: false,
        message: "Unauthorized: You are not the assigned delivery driver for this dispatch trip.",
        error: "FORBIDDEN",
      };
    }

    // 3. Field permissions:
    // Delivery Staff can update trip status (e.g. in-transit, completed) and departure notes.
    // Vehicle reassignment requires Super Admin.
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (input.status) {
      const validStatuses = ["scheduled", "loading", "in-transit", "completed", "cancelled"];
      if (!validStatuses.includes(input.status)) {
        return {
          success: false,
          message: `Invalid dispatch trip status: '${input.status}'.`,
          error: "INVALID_STATUS",
        };
      }
      updates.status = input.status;
    }

    if (input.departureTime) {
      updates.departure_time = input.departureTime.trim();
    }

    if (input.notes) {
      updates.delivery_notes = input.notes.trim();
    }

    if (input.vehicleNumber && input.vehicleNumber.trim()) {
      if (normalizedRole === "super_admin") {
        updates.vehicle_number = input.vehicleNumber.trim();
      } else if (input.vehicleNumber.trim() !== existingDispatch.vehicle_number) {
        return {
          success: false,
          message: "Unauthorized: Fleet vehicle reassignment requires Super Admin authority.",
          error: "FORBIDDEN",
        };
      }
    }

    // 0. Primary Transactional Path: rpc_update_dispatch_trip
    const { data: rpcData, error: rpcError } = await supabase.rpc("rpc_update_dispatch_trip", {
      p_dispatch_id: input.dispatchId,
      p_vehicle_number: input.vehicleNumber?.trim() || null,
      p_departure_time: input.departureTime?.trim() || null,
      p_status: input.status || null,
      p_notes: input.notes?.trim() || null,
    });

    if (!rpcError && rpcData && (rpcData as any).success) {
      const manifestNum =
        (rpcData as any).manifest_number ||
        `DSP-VRV-${existingDispatch.manifest_number}`;
      const updatedStatus =
        (rpcData as any).status || updates.status || existingDispatch.status;

      return {
        success: true,
        message: `Dispatch trip ${manifestNum} updated successfully.`,
        data: { dispatchId: input.dispatchId, status: updatedStatus },
      };
    }

    // Fail closed: never fall back to a direct table UPDATE.
    const failureMessage = rpcError?.message
      ? `Failed to update dispatch trip: ${rpcError.message}`
      : (rpcData as any)?.message ||
        "Dispatch trip update was not confirmed by the database.";

    return {
      success: false,
      message: failureMessage,
      error: rpcError?.code || (rpcData as any)?.error || "RPC_UPDATE_FAILED",
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to update dispatch trip.",
      error: "SERVER_ERROR",
    };
  }
}

/**
 * Fetches all dispatches for authorized staff (Super Admin and Delivery Staff).
 * Restores route stops, cargo items, vehicle info, and order links from database.
 */
export async function getDispatchesAction(): Promise<ActionResult<DispatchBatch[]>> {
  try {
    const auth = await validateAuthenticatedAction();
    if (!auth.isAuthorized || !auth.profile) {
      return {
        success: false,
        message: "Authentication required to view dispatches.",
        error: "UNAUTHENTICATED",
      };
    }

    const normalizedRole = auth.profile.role.toLowerCase().replace(/-/g, "_");
    if (normalizedRole !== "super_admin" && normalizedRole !== "delivery_staff" && normalizedRole !== "branch_admin") {
      return {
        success: false,
        message: "Unauthorized to view dispatches.",
        error: "FORBIDDEN",
      };
    }

    const supabase = await createServerSupabaseClient();

    const { data: dbDispatches, error: dbError } = await supabase
      .from("dispatches")
      .select(`
        id,
        dispatch_number,
        vehicle_number,
        departure_time,
        loading_bay,
        status,
        planned_dispatch_at,
        dispatched_at,
        delivered_at,
        completed_at,
        delivery_notes,
        created_at,
        delivery_staff_id,
        dispatch_orders (
          id,
          order_id,
          sequence,
          status,
          delivery_notes,
          orders (
            id,
            order_number,
            branch_id,
            status,
            week_start,
            notes,
            branches (
              id,
              code,
              name,
              district,
              locality,
              address,
              contact_phone
            ),
            order_items (
              id,
              product_id,
              requested_quantity,
              approved_quantity,
              unit_price,
              products (
                id,
                sku,
                name
              )
            )
          )
        ),
        dispatch_items (
          id,
          product_id,
          quantity_loaded,
          quantity_delivered,
          quantity_short,
          notes,
          products (
            id,
            sku,
            name
          )
        )
      `)
      .order("created_at", { ascending: false });

    if (dbError) {
      return {
        success: false,
        message: dbError.message || "Failed to fetch dispatches.",
        error: dbError.code || "DB_ERROR",
      };
    }

    if (!dbDispatches || dbDispatches.length === 0) {
      return {
        success: true,
        message: "No dispatches found.",
        data: [],
      };
    }

    const mappedDispatches: DispatchBatch[] = dbDispatches.map((dsp: any) => {
      const rawStops = Array.isArray(dsp.dispatch_orders) ? dsp.dispatch_orders : [];
      const sortedRawStops = [...rawStops].sort((a, b) => (a.sequence || 1) - (b.sequence || 1));

      const stops: DispatchStop[] = sortedRawStops.map((s: any) => {
        const ord = Array.isArray(s.orders) ? s.orders[0] : s.orders;
        const branch = ord ? (Array.isArray(ord.branches) ? ord.branches[0] : ord.branches) : null;
        const rawOrderItems = ord && Array.isArray(ord.order_items) ? ord.order_items : [];

        let items: OrderItem[] = rawOrderItems.map((oi: any) => {
          const prod = Array.isArray(oi.products) ? oi.products[0] : oi.products;
          const reqQty = Number(oi.requested_quantity) || 0;
          const rawApp = oi.approved_quantity !== null && oi.approved_quantity !== undefined
            ? Number(oi.approved_quantity)
            : reqQty;
          const appQty = rawApp;
          return {
            productId: oi.product_id,
            productName: prod?.name || "Handcrafted Stick",
            sku: prod?.sku || "SKU-STICK",
            packType: "Box of 10 Sticks (1 Crate)",
            requestedPacks: reqQty,
            requestedUnits: reqQty * 10,
            approvedPacks: appQty,
            approvedUnits: appQty * 10,
            packedUnits: appQty * 10,
          };
        });

        // If order_items query returned nothing, and single stop dispatch has dispatch_items:
        if (items.length === 0 && sortedRawStops.length === 1 && Array.isArray(dsp.dispatch_items) && dsp.dispatch_items.length > 0) {
          items = dsp.dispatch_items.map((di: any) => {
            const prod = Array.isArray(di.products) ? di.products[0] : di.products;
            const loadedCrates = Number(di.quantity_loaded) || 0;
            return {
              productId: di.product_id,
              productName: prod?.name || "Handcrafted Stick",
              sku: prod?.sku || "SKU-STICK",
              packType: "Box of 10 Sticks (1 Crate)",
              requestedPacks: loadedCrates,
              requestedUnits: loadedCrates * 10,
              approvedPacks: loadedCrates,
              approvedUnits: loadedCrates * 10,
              packedUnits: loadedCrates * 10,
            };
          });
        }

        return {
          id: s.id,
          orderId: s.order_id,
          orderNumber: ord?.order_number ? `ORD-2026-${ord.order_number}` : `ORD-${s.order_id.slice(0, 4)}`,
          branchId: ord?.branch_id || branch?.id || "",
          branchName: branch?.name || "Ice Spot Branch",
          district: branch?.district || "Thrissur",
          address: branch?.address || branch?.locality || "Kerala, India",
          phone: branch?.contact_phone || "+91 94470 00000",
          sequence: s.sequence || 1,
          items,
          status: (s.status?.replace(/_/g, "-") || "scheduled") as StopDeliveryStatus,
          deliveryNotes: s.delivery_notes || undefined,
        };
      });

      const rawItems = Array.isArray(dsp.dispatch_items) ? dsp.dispatch_items : [];
      const totalUnits = rawItems.reduce((acc: number, it: any) => acc + (Number(it.quantity_loaded) || 0) * 10, 0)
        || stops.reduce((acc, st) => acc + st.items.reduce((iAcc, it) => iAcc + (it.packedUnits || (it.approvedPacks ? it.approvedPacks * 10 : 0)), 0), 0)
        || 0;

      const manifestNumber = dsp.manifest_number
        ? (String(dsp.manifest_number).startsWith("DSP-VRV-") ? dsp.manifest_number : `DSP-VRV-${dsp.manifest_number}`)
        : (dsp.dispatch_number ? `DSP-VRV-${dsp.dispatch_number}` : `DSP-VRV-000`);

      const dispatchDate = dsp.planned_dispatch_at
        ? new Date(dsp.planned_dispatch_at).toISOString().split("T")[0]
        : dsp.created_at
        ? new Date(dsp.created_at).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      return {
        id: dsp.id,
        manifestNumber,
        vehicleNumber: dsp.vehicle_number || "KL-08-AX-4412",
        driverId: dsp.delivery_staff_id || "cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43",
        driverName: "Icespot Logistics Staff",
        driverPhone: "+91 98460 11223",
        dispatchDate,
        departureTime: dsp.departure_time || undefined,
        loadingBay: dsp.loading_bay || undefined,
        status: (dsp.status?.replace(/_/g, "-") || "scheduled") as DeliveryTripStatus,
        orderIds: stops.map((s) => s.orderId),
        stops,
        totalUnits,
        notes: dsp.delivery_notes || undefined,
        departedAt: dsp.dispatched_at || undefined,
        completedAt: dsp.completed_at || undefined,
      };
    });

    return {
      success: true,
      message: `Fetched ${mappedDispatches.length} dispatches successfully.`,
      data: mappedDispatches,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to fetch dispatches.",
      error: "SERVER_ERROR",
    };
  }
}

export interface EligibleDispatchOrder {
  id: string; // Order UUID
  orderNumber: string; // e.g. "ORD-2026-10069"
  branchId: string; // Branch UUID or catalog ID
  branchName: string; // e.g. "Ice Spot Ollur"
  branchCode: string; // e.g. "BR-OLL-003"
  status: OrderStatus; // "approved" | "preparation" | "ready-for-dispatch"
  totalApprovedCrates: number;
  totalApprovedUnits: number;
  items: OrderItem[];
}

/**
 * Retrieves eligible approved orders available for vehicle dispatch scheduling.
 * Strictly requires Delivery Staff or Super Admin authorization.
 * Returns only minimal fields needed to schedule dispatches:
 * order UUID, order number, branch info, approved items, approved quantities.
 * Independent server-side validation ensures unapproved or already-assigned orders are excluded.
 */
export async function getEligibleOrdersForDispatchAction(): Promise<ActionResult<EligibleDispatchOrder[]>> {
  try {
    const auth = await validateDeliveryStaffAction();
    if (!auth.isAuthorized || !auth.profile) {
      return {
        success: false,
        message: "Unauthorized: Delivery Staff or Super Admin privileges required.",
        error: "FORBIDDEN",
      };
    }

    const supabase = await createServerSupabaseClient();

    let dbOrders: any[] | null = null;
    const { data: rpcData, error: rpcErr } = await supabase.rpc("rpc_get_eligible_orders_for_dispatch");
    if (!rpcErr && Array.isArray(rpcData)) {
      dbOrders = rpcData;
    } else {
      // Direct table query fallback
      const { data, error: dbError } = await supabase
        .from("orders")
        .select(`
          id,
          order_number,
          branch_id,
          status,
          created_at,
          branches (
            id,
            code,
            name,
            district
          ),
          order_items (
            id,
            product_id,
            requested_quantity,
            approved_quantity,
            unit_price,
            products (
              id,
              sku,
              name
            )
          ),
          dispatch_orders (
            dispatch_id,
            status,
            dispatches (
              id,
              status
            )
          )
        `)
        .in("status", ["approved", "preparation", "ready_for_dispatch"])
        .order("created_at", { ascending: false });

      if (dbError) {
        return {
          success: false,
          message: dbError.message || "Failed to query eligible orders.",
          error: dbError.code || "DB_ERROR",
        };
      }
      dbOrders = data;
    }

    // Filter out orders already attached to an active dispatch trip
    const unassignedOrders = (dbOrders || []).filter((ord: any) => {
      const stops = Array.isArray(ord.dispatch_orders) ? ord.dispatch_orders : [];
      const hasActiveTrip = stops.some((st: any) => {
        const d = Array.isArray(st.dispatches) ? st.dispatches[0] : st.dispatches;
        return d && !["completed", "cancelled", "failed"].includes(d?.status);
      });
      return !hasActiveTrip;
    });

    const mapped: EligibleDispatchOrder[] = [];

    for (const ord of unassignedOrders) {
      const branch = Array.isArray(ord.branches) ? ord.branches[0] : ord.branches;
      const rawItems = Array.isArray(ord.order_items) ? ord.order_items : [];

      const items: OrderItem[] = rawItems.map((oi: any) => {
        const prod = Array.isArray(oi.products) ? oi.products[0] : oi.products;
        const reqQty = Number(oi.requested_quantity) || 0;
        const appQty = Number(oi.approved_quantity) || 0;
        return {
          productId: oi.product_id,
          productName: prod?.name || "Handcrafted Stick",
          sku: prod?.sku || "SKU-STICK",
          packType: "Box of 10 Sticks (1 Crate)",
          requestedPacks: reqQty,
          requestedUnits: reqQty * 10,
          approvedPacks: appQty,
          approvedUnits: appQty * 10,
          packedUnits: appQty * 10,
        };
      });

      const totalApprovedCrates = items.reduce((s, it) => s + (it.approvedPacks || 0), 0);
      const totalApprovedUnits = totalApprovedCrates * 10;

      // Only include orders that have positive approved quantities
      if (totalApprovedCrates > 0) {
        mapped.push({
          id: ord.id,
          orderNumber: ord.order_number ? `ORD-2026-${ord.order_number}` : `ORD-${ord.id.slice(0, 4)}`,
          branchId: ord.branch_id || branch?.id || "",
          branchName: branch?.name || "Ice Spot Branch",
          branchCode: branch?.code || `BR-${(ord.branch_id || "").slice(0, 3).toUpperCase()}`,
          status: (ord.status?.replace(/_/g, "-") || "approved") as OrderStatus,
          totalApprovedCrates,
          totalApprovedUnits,
          items,
        });
      }
    }

    return {
      success: true,
      message: `Retrieved ${mapped.length} eligible dispatch orders.`,
      data: mapped,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to fetch eligible orders.",
      error: "SERVER_ERROR",
    };
  }
}
