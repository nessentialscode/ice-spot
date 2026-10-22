"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  validateSuperAdminAction,
  validateAuthenticatedAction,
} from "@/lib/supabase/server-auth";
import { OrderItem, OrderStatus } from "@/types/admin";

export interface CreateOrderInput {
  branchId: string;
  branchName: string;
  district: string;
  items: OrderItem[];
  requestedDeliveryDate: string;
  notes?: string;
}

export interface ActionResult<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

// Valid status transitions map to prevent invalid lifecycle jumps
const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["under-review", "approved", "cancelled"],
  "under-review": ["approved", "cancelled", "submitted"],
  approved: ["preparation", "ready-for-dispatch", "cancelled", "amendment-requested"],
  preparation: ["ready-for-dispatch", "cancelled", "amendment-requested"],
  "ready-for-dispatch": ["dispatched", "cancelled"],
  dispatched: ["delivered", "partially-delivered"],
  delivered: [],
  "partially-delivered": ["delivered"],
  cancelled: [],
  "amendment-requested": ["approved", "cancelled"],
};

/**
 * Creates a new order in Supabase `orders` and `order_items` tables.
 * Handles database errors without falsely showing success.
 */
export async function createOrderAction(
  input: CreateOrderInput
): Promise<ActionResult<{ orderId: string; orderNumber: string }>> {
  try {
    const auth = await validateAuthenticatedAction();
    if (!auth.isAuthorized) {
      return {
        success: false,
        message: auth.message || "Authentication required to place orders.",
        error: auth.error || "UNAUTHENTICATED",
      };
    }

    if (!input.branchId || !input.items || input.items.length === 0) {
      return {
        success: false,
        message: "Order must contain at least one product item and a target branch.",
        error: "VALIDATION_ERROR",
      };
    }

    const orderNumber = `ORD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const totalUnitsRequested = input.items.reduce((sum, item) => sum + (item.requestedUnits || 0), 0);

    const supabase = await createServerSupabaseClient();

    // 1. Insert Order
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number: orderNumber,
        branch_id: input.branchId,
        branch_name: input.branchName,
        district: input.district,
        status: "submitted",
        requested_delivery_date: input.requestedDeliveryDate,
        branch_notes: input.notes || null,
        total_units_requested: totalUnitsRequested,
        total_units_approved: 0,
        created_by: auth.user?.id || null,
      })
      .select("id, order_number")
      .single();

    if (orderError || !orderData) {
      return {
        success: false,
        message: `Failed to record order: ${orderError?.message || "Unknown DB error"}`,
        error: orderError?.code || "DB_ERROR",
      };
    }

    // 2. Insert Order Items
    const itemsToInsert = input.items.map((item) => ({
      order_id: orderData.id,
      product_id: item.productId,
      product_name: item.productName,
      sku: item.sku,
      pack_type: item.packType,
      requested_packs: item.requestedPacks,
      requested_units: item.requestedUnits,
      approved_packs: 0,
      approved_units: 0,
      notes: item.notes || null,
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert);
    if (itemsError) {
      return {
        success: false,
        message: `Order created but item recording failed: ${itemsError.message}`,
        error: itemsError.code || "DB_ERROR",
      };
    }

    // 3. Log to audit_logs
    if (auth.user?.id) {
      await supabase.from("audit_logs").insert({
        user_id: auth.user.id,
        action: "CREATE_ORDER",
        entity_type: "order",
        entity_id: orderData.id,
        changes: { orderNumber, totalUnitsRequested, branch: input.branchName },
      });
    }

    return {
      success: true,
      message: `Order ${orderNumber} created successfully.`,
      data: { orderId: orderData.id, orderNumber: orderData.order_number },
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to create order.",
      error: "SERVER_ERROR",
    };
  }
}

/**
 * Approves an order and updates approved quantities.
 * Strictly requires Super Admin authorization.
 * Prevents invalid lifecycle transitions and duplicate approvals.
 */
export async function approveOrderAction(
  orderId: string,
  approvedPacksMap: Record<string, number>,
  factoryNotes?: string
): Promise<ActionResult<{ orderId: string; totalApprovedUnits: number }>> {
  try {
    const auth = await validateSuperAdminAction();
    if (!auth.isAuthorized) {
      return {
        success: false,
        message: auth.message || "Unauthorized: Super Admin authority required to approve orders.",
        error: auth.error || "FORBIDDEN",
      };
    }

    const supabase = await createServerSupabaseClient();

    // 1. Fetch current order to verify state
    const { data: currentOrder, error: fetchOrderError } = await supabase
      .from("orders")
      .select("id, order_number, status, branch_name")
      .eq("id", orderId)
      .single();

    if (fetchOrderError || !currentOrder) {
      return {
        success: false,
        message: `Order not found: ${fetchOrderError?.message || orderId}`,
        error: fetchOrderError?.code || "NOT_FOUND",
      };
    }

    const currentStatus = currentOrder.status as OrderStatus;
    const allowedTargets = ALLOWED_ORDER_TRANSITIONS[currentStatus] || [];
    if (!allowedTargets.includes("approved") && currentStatus !== "approved") {
      return {
        success: false,
        message: `Invalid order state transition: cannot approve order in status "${currentStatus}".`,
        error: "INVALID_TRANSITION",
      };
    }

    // 2. Fetch current items to calculate approved units
    const { data: items, error: itemsFetchError } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);

    if (itemsFetchError) {
      return {
        success: false,
        message: `Failed to fetch order items: ${itemsFetchError.message}`,
        error: itemsFetchError.code || "DB_ERROR",
      };
    }

    let totalApprovedUnits = 0;

    if (items && items.length > 0) {
      for (const item of items) {
        const approvedPacks = approvedPacksMap[item.product_id] ?? item.requested_packs;
        const unitsPerPack = item.requested_packs > 0 ? Math.round(item.requested_units / item.requested_packs) : 24;
        const approvedUnits = approvedPacks * unitsPerPack;
        totalApprovedUnits += approvedUnits;

        const { error: itemUpdateError } = await supabase
          .from("order_items")
          .update({
            approved_packs: approvedPacks,
            approved_units: approvedUnits,
          })
          .eq("id", item.id);

        if (itemUpdateError) {
          return {
            success: false,
            message: `Failed updating quantities for SKU ${item.sku}: ${itemUpdateError.message}`,
            error: itemUpdateError.code || "DB_ERROR",
          };
        }
      }
    }

    // 3. Update order record
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "approved",
        total_units_approved: totalApprovedUnits,
        factory_notes: factoryNotes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (updateError) {
      return {
        success: false,
        message: updateError.message,
        error: updateError.code || "DB_ERROR",
      };
    }

    // 4. Audit Log
    if (auth.user?.id) {
      await supabase.from("audit_logs").insert({
        user_id: auth.user.id,
        action: "APPROVE_ORDER",
        entity_type: "order",
        entity_id: orderId,
        changes: {
          totalApprovedUnits,
          factoryNotes,
          approver: auth.profile?.full_name || auth.user.email,
        },
      });
    }

    return {
      success: true,
      message: `Order ${currentOrder.order_number} for ${currentOrder.branch_name} approved successfully (${totalApprovedUnits} units).`,
      data: { orderId, totalApprovedUnits },
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Approval failed.",
      error: "SERVER_ERROR",
    };
  }
}

/**
 * Updates order status (e.g. cancelled, under-review, preparation, ready-for-dispatch)
 * Validates state transition lifecycle.
 */
export async function updateOrderStatusAction(
  orderId: string,
  newStatus: OrderStatus,
  reason?: string
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

    // 1. Fetch current order
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, status, order_number")
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      return {
        success: false,
        message: `Order not found: ${fetchError?.message || orderId}`,
        error: fetchError?.code || "NOT_FOUND",
      };
    }

    const currentStatus = order.status as OrderStatus;
    const allowedTargets = ALLOWED_ORDER_TRANSITIONS[currentStatus] || [];

    if (!allowedTargets.includes(newStatus) && currentStatus !== newStatus) {
      return {
        success: false,
        message: `Invalid transition from "${currentStatus}" to "${newStatus}".`,
        error: "INVALID_TRANSITION",
      };
    }

    const updatePayload: Record<string, any> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === "cancelled" && reason) {
      updatePayload.cancel_reason = reason;
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId);

    if (updateError) {
      return {
        success: false,
        message: updateError.message,
        error: updateError.code || "DB_ERROR",
      };
    }

    if (auth.user?.id) {
      await supabase.from("audit_logs").insert({
        user_id: auth.user.id,
        action: `SET_ORDER_${newStatus.toUpperCase()}`,
        entity_type: "order",
        entity_id: orderId,
        changes: { previousStatus: currentStatus, newStatus, reason },
      });
    }

    return {
      success: true,
      message: `Order ${order.order_number} status updated to ${newStatus}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to update order status.",
      error: "SERVER_ERROR",
    };
  }
}
