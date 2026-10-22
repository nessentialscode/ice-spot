"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  validateSuperAdminAction,
  validateAuthenticatedAction,
} from "@/lib/supabase/server-auth";
import { StopDeliveryStatus } from "@/types/admin";

export interface CreateDispatchInput {
  vehicleNumber: string;
  driverId?: string;
  driverName: string;
  driverPhone?: string;
  orderIds: string[];
  notes?: string;
}

export interface ActionResult<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

/**
 * Creates a new dispatch batch and links the assigned orders.
 * Strictly requires Super Admin authorization.
 * Handles database errors without falsely showing success.
 */
export async function createDispatchAction(
  input: CreateDispatchInput
): Promise<ActionResult<{ dispatchId: string; manifestNumber: string }>> {
  try {
    const auth = await validateSuperAdminAction();
    if (!auth.isAuthorized) {
      return {
        success: false,
        message: auth.message || "Unauthorized: Super Admin authority required to create logistics dispatches.",
        error: auth.error || "FORBIDDEN",
      };
    }

    if (!input.vehicleNumber.trim() || !input.driverName.trim()) {
      return {
        success: false,
        message: "Vehicle number and driver name are required.",
        error: "VALIDATION_ERROR",
      };
    }

    const manifestNumber = `DSP-VRV-${Math.floor(100 + Math.random() * 900)}`;
    const supabase = await createServerSupabaseClient();

    // 1. Insert Dispatch
    const { data: dispatch, error: dispatchError } = await supabase
      .from("dispatches")
      .insert({
        manifest_number: manifestNumber,
        vehicle_number: input.vehicleNumber.trim().toUpperCase(),
        driver_id: input.driverId || null,
        driver_name: input.driverName.trim(),
        driver_phone: input.driverPhone || null,
        dispatch_date: new Date().toISOString().split("T")[0],
        status: "scheduled",
        notes: input.notes || null,
      })
      .select("id, manifest_number")
      .single();

    if (dispatchError || !dispatch) {
      return {
        success: false,
        message: `Database failed to create dispatch manifest: ${dispatchError?.message || "Unknown error"}`,
        error: dispatchError?.code || "DB_ERROR",
      };
    }

    // 2. Link orders as dispatch items / stops
    if (input.orderIds && input.orderIds.length > 0) {
      const stopsToInsert = input.orderIds.map((orderId, idx) => ({
        dispatch_id: dispatch.id,
        order_id: orderId,
        sequence: idx + 1,
        status: "pending",
      }));

      const { error: stopsError } = await supabase.from("dispatch_items").insert(stopsToInsert);
      if (stopsError) {
        return {
          success: false,
          message: `Dispatch created but attaching stops failed: ${stopsError.message}`,
          error: stopsError.code || "DB_ERROR",
        };
      }

      // Update orders status to 'dispatched'
      for (const orderId of input.orderIds) {
        await supabase
          .from("orders")
          .update({
            status: "dispatched",
            assigned_dispatch_id: dispatch.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);
      }
    }

    // 3. Audit Log
    if (auth.user?.id) {
      await supabase.from("audit_logs").insert({
        user_id: auth.user.id,
        action: "CREATE_DISPATCH",
        entity_type: "dispatch",
        entity_id: dispatch.id,
        changes: {
          manifestNumber,
          vehicleNumber: input.vehicleNumber,
          ordersCount: input.orderIds?.length || 0,
          actor: auth.profile?.full_name || auth.user.email,
        },
      });
    }

    return {
      success: true,
      message: `Manifest ${manifestNumber} generated successfully for vehicle ${input.vehicleNumber}.`,
      data: { dispatchId: dispatch.id, manifestNumber: dispatch.manifest_number },
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
 */
export async function updateStopStatusAction(
  dispatchId: string,
  orderId: string,
  status: StopDeliveryStatus,
  deliveredUnits?: number,
  notes?: string,
  failureReason?: string
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

    const supabase = await createServerSupabaseClient();

    const payload: Record<string, any> = {
      status,
      delivery_notes: notes || null,
      failure_reason: failureReason || null,
    };

    if (deliveredUnits !== undefined) {
      payload.delivered_units = deliveredUnits;
    }

    if (status === "delivered") {
      payload.completed_at = new Date().toISOString();
    } else if (status === "in-transit" || status === "reached") {
      payload.arrived_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("dispatch_items")
      .update(payload)
      .eq("dispatch_id", dispatchId)
      .eq("order_id", orderId);

    if (error) {
      return {
        success: false,
        message: `Failed to update stop status: ${error.message}`,
        error: error.code || "DB_ERROR",
      };
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
