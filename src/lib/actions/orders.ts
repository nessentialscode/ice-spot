"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  validateSuperAdminAction,
  validateAuthenticatedAction,
  validateBranchAdminAction,
} from "@/lib/supabase/server-auth";
import { OrderStatus, AdminOrder, OrderItem } from "@/types/admin";

export interface CreateOrderItemInput {
  productId: string;
  requestedQuantity: number;
  unitPrice?: number;
}

export interface CreateOrderInput {
  branchId: string;
  items: CreateOrderItemInput[];
  weekStart?: string;
  notes?: string;
}

export interface ActionResult<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

// Valid lifecycle transitions for orders
const ALLOWED_ORDER_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["under_review", "approved", "cancelled", "amendment_requested"],
  under_review: ["approved", "cancelled", "submitted", "amendment_requested"],
  approved: ["preparation", "ready_for_dispatch", "cancelled", "amendment_requested"],
  preparation: ["ready_for_dispatch", "cancelled", "amendment_requested"],
  ready_for_dispatch: ["dispatched", "cancelled"],
  dispatched: ["delivered", "partially_delivered"],
  delivered: [],
  partially_delivered: ["delivered"],
  cancelled: [],
  amendment_requested: ["submitted", "under_review", "approved", "cancelled"],
};

/**
 * Computes the Monday of the current week if weekStart is not provided.
 */
function getDefaultWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split("T")[0];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates a new order using the transactional RPC or safe transactional writes.
 */
export async function createOrderAction(
  input: CreateOrderInput
): Promise<ActionResult<{ orderId: string; orderNumber: number | string }>> {
  try {
    if (!input.branchId || !UUID_REGEX.test(input.branchId)) {
      return {
        success: false,
        message: "A valid branch UUID is required to create an order.",
        error: "INVALID_IDENTIFIER",
      };
    }

    const auth = await validateBranchAdminAction(input.branchId);
    if (!auth.isAuthorized) {
      return {
        success: false,
        message: auth.message || "Unauthorized to place orders for this branch.",
        error: auth.error || "FORBIDDEN",
      };
    }

    if (!input.items || input.items.length === 0) {
      return {
        success: false,
        message: "Order must contain at least one product item.",
        error: "VALIDATION_ERROR",
      };
    }

    for (const it of input.items) {
      if (!it.productId || !UUID_REGEX.test(it.productId)) {
        return {
          success: false,
          message: `Invalid product identifier format: ${it.productId}. UUID required.`,
          error: "INVALID_IDENTIFIER",
        };
      }
      if (it.requestedQuantity <= 0 || !Number.isFinite(it.requestedQuantity)) {
        return {
          success: false,
          message: `Invalid product quantity for item ${it.productId}: must be a positive number.`,
          error: "INVALID_QUANTITY",
        };
      }
    }

    const weekStart = input.weekStart || getDefaultWeekStart();
    const supabase = await createServerSupabaseClient();

    // Enforce server-side authorized branch identity (do not trust unverified client branch ID)
    const normalizedRole = auth.profile?.role?.toLowerCase().replace(/-/g, "_");
    const targetBranchId =
      normalizedRole === "branch_admin"
        ? (auth.profile?.branch_id || input.branchId)
        : input.branchId;

    // 0. Proactively check if a pending order already exists for this branch
    const { data: existingPendingOrder } = await supabase
      .from("orders")
      .select("id, order_number, status")
      .eq("branch_id", targetBranchId)
      .in("status", ["submitted", "under_review"])
      .limit(1)
      .maybeSingle();

    if (existingPendingOrder) {
      return {
        success: false,
        message: `A replenishment order (ORD-2026-${existingPendingOrder.order_number}) is already pending review for this branch.`,
        error: "PENDING_ORDER_EXISTS",
        data: {
          orderId: existingPendingOrder.id,
          orderNumber: existingPendingOrder.order_number,
        },
      };
    }

    // 1. Attempt atomic RPC invocation
    const { data: rpcData, error: rpcError } = await supabase.rpc("rpc_create_order", {
      p_branch_id: targetBranchId,
      p_week_start: weekStart,
      p_notes: input.notes || null,
      p_items: input.items.map((it) => ({
        product_id: it.productId,
        requested_quantity: it.requestedQuantity,
        unit_price: it.unitPrice || null,
      })),
    });

    if (rpcError) {
      const isUniqueOrPending =
        rpcError.code === "23505" ||
        rpcError.message?.toLowerCase().includes("pending review") ||
        rpcError.message?.toLowerCase().includes("idx_orders_one_pending_per_branch");

      if (isUniqueOrPending) {
        return {
          success: false,
          message: rpcError.message || "A replenishment order is already pending review for this branch.",
          error: "PENDING_ORDER_EXISTS",
        };
      }

      return {
        success: false,
        message: rpcError.message || "Failed to place order.",
        error: rpcError.code || "RPC_ERROR",
      };
    }

    if (rpcData && (rpcData as any).success) {
      try {
        revalidatePath("/admin/super-admin");
        revalidatePath("/admin/branch");
        revalidatePath("/admin/delivery");
      } catch {
        // Safe to ignore outside request context (e.g. CLI or unit tests)
      }

      return {
        success: true,
        message: "Order placed successfully.",
        data: {
          orderId: (rpcData as any).order_id,
          orderNumber: (rpcData as any).order_number,
        },
      };
    }

    return {
      success: false,
      message: "Unexpected response from order creation service.",
      error: "UNEXPECTED_RESPONSE",
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "An unexpected error occurred while placing order.",
      error: "SERVER_ERROR",
    };
  }
}

/**
 * Approves an order and updates approved quantities.
 * Strictly requires Super Admin authorization.
 */
export async function approveOrderAction(
  orderId: string,
  approvedItems?: { productId: string; approvedQuantity: number }[],
  notes?: string
): Promise<ActionResult<{ orderId: string }>> {
  try {
    const auth = await validateSuperAdminAction();
    if (!auth.isAuthorized) {
      return {
        success: false,
        message: auth.message || "Unauthorized: Super Admin privileges required.",
        error: auth.error || "FORBIDDEN",
      };
    }

    if (!orderId || !UUID_REGEX.test(orderId)) {
      return {
        success: false,
        message: "Invalid order identifier format (UUID required).",
        error: "INVALID_IDENTIFIER",
      };
    }

    const supabase = await createServerSupabaseClient();

    // 1. Try atomic RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc("rpc_approve_order", {
      p_order_id: orderId,
      p_approved_items: approvedItems
        ? approvedItems.map((i) => ({
            product_id: i.productId,
            approved_quantity: i.approvedQuantity,
          }))
        : null,
      p_notes: notes || null,
    });

    if (rpcError) {
      return {
        success: false,
        message: rpcError.message || "Failed to approve order.",
        error: rpcError.code || "RPC_ERROR",
      };
    }

    if (rpcData && (rpcData as any).success) {
      try {
        revalidatePath("/admin/super-admin");
        revalidatePath("/admin/branch");
        revalidatePath("/admin/delivery");
      } catch {
        // Safe to ignore outside request context
      }

      return {
        success: true,
        message: "Order approved successfully.",
        data: { orderId },
      };
    }

    return {
      success: false,
      message: "Unexpected response from order approval service.",
      error: "UNEXPECTED_RESPONSE",
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to approve order.",
      error: "SERVER_ERROR",
    };
  }
}

/**
 * Updates order lifecycle status with transition validation.
 */
export async function updateOrderStatusAction(
  orderId: string,
  newStatus: string,
  notes?: string
): Promise<ActionResult> {
  try {
    const auth = await validateAuthenticatedAction();
    if (!auth.isAuthorized) {
      return {
        success: false,
        message: "Authentication required to update order status.",
        error: "UNAUTHENTICATED",
      };
    }

    if (!orderId || !UUID_REGEX.test(orderId)) {
      return {
        success: false,
        message: "Invalid order identifier format (UUID required).",
        error: "INVALID_IDENTIFIER",
      };
    }

    const supabase = await createServerSupabaseClient();
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, status, branch_id")
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      return {
        success: false,
        message: "Order not found.",
        error: "NOT_FOUND",
      };
    }

    // Check transition
    const normalizedNewStatus = newStatus.replace(/-/g, "_");
    const currentStatus = order.status ? order.status.replace(/-/g, "_") : "";
    const allowed =
      ALLOWED_ORDER_TRANSITIONS[order.status] ||
      ALLOWED_ORDER_TRANSITIONS[currentStatus] ||
      [];
    if (!allowed.includes(newStatus) && !allowed.includes(normalizedNewStatus)) {
      return {
        success: false,
        message: `Invalid status transition from '${order.status}' to '${newStatus}'.`,
        error: "INVALID_TRANSITION",
      };
    }

    // Role-based authorization
    const normalizedRole = auth.profile?.role?.toLowerCase().replace(/-/g, "_");
    const isSuperAdmin = normalizedRole === "super_admin";
    if (!isSuperAdmin) {
      if (order.branch_id !== auth.profile?.branch_id) {
        return {
          success: false,
          message: "Unauthorized: Cannot modify an order for another branch.",
          error: "FORBIDDEN",
        };
      }
      if (normalizedNewStatus !== "cancelled" && normalizedNewStatus !== "submitted") {
        return {
          success: false,
          message: "Branch Admins can only submit or cancel their orders.",
          error: "FORBIDDEN",
        };
      }
    }

    // Perform update and verify row mutation in database using .select()
    const { data: updatedRows, error: updateError } = await supabase
      .from("orders")
      .update({
        status: normalizedNewStatus,
        notes: notes || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select("id, status, notes");

    if (updateError) {
      return {
        success: false,
        message: updateError.message,
        error: updateError.code || "DB_ERROR",
      };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return {
        success: false,
        message: "No order record was updated; check database permissions or order ID.",
        error: "NO_ROWS_UPDATED",
      };
    }

    try {
      await supabase.from("audit_logs").insert({
        actor_id: auth.user!.id,
        action: "ORDER_STATUS_UPDATED",
        entity_type: "order",
        entity_id: orderId,
        details: { previousStatus: order.status, newStatus: normalizedNewStatus, notes },
      });
    } catch (auditErr) {
      console.warn("[updateOrderStatusAction] Audit log write warning:", auditErr);
    }

    try {
      revalidatePath("/admin/super-admin");
      revalidatePath("/admin/branch");
      revalidatePath("/admin/delivery");
    } catch {
      // Safe to ignore outside request context
    }

    return {
      success: true,
      message: `Order status updated to ${newStatus}.`,
      data: { orderId, status: normalizedNewStatus },
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to update order status.",
      error: "SERVER_ERROR",
    };
  }
}

/**
 * Rejects an order with a mandatory reason. Strictly requires Super Admin authorization.
 */
export async function rejectOrderAction(
  orderId: string,
  reason: string
): Promise<ActionResult<{ orderId: string; status: string }>> {
  const auth = await validateSuperAdminAction();
  if (!auth.isAuthorized) {
    return {
      success: false,
      message: auth.message || "Unauthorized: Super Admin privileges required.",
      error: auth.error || "FORBIDDEN",
    };
  }

  if (!orderId || !UUID_REGEX.test(orderId)) {
    return {
      success: false,
      message: "Invalid order identifier format (UUID required).",
      error: "INVALID_IDENTIFIER",
    };
  }

  if (!reason || !reason.trim()) {
    return {
      success: false,
      message: "Please provide a reason for order rejection.",
      error: "VALIDATION_ERROR",
    };
  }

  return updateOrderStatusAction(orderId, "cancelled", `Rejected by factory: ${reason.trim()}`);
}

/**
 * Returns an order to branch for correction. Strictly requires Super Admin authorization.
 */
export async function returnOrderForCorrectionAction(
  orderId: string,
  feedback: string
): Promise<ActionResult<{ orderId: string; status: string }>> {
  const auth = await validateSuperAdminAction();
  if (!auth.isAuthorized) {
    return {
      success: false,
      message: auth.message || "Unauthorized: Super Admin privileges required.",
      error: auth.error || "FORBIDDEN",
    };
  }

  if (!orderId || !UUID_REGEX.test(orderId)) {
    return {
      success: false,
      message: "Invalid order identifier format (UUID required).",
      error: "INVALID_IDENTIFIER",
    };
  }

  if (!feedback || !feedback.trim()) {
    return {
      success: false,
      message: "Please describe what the branch needs to adjust before the order can be approved.",
      error: "VALIDATION_ERROR",
    };
  }

  return updateOrderStatusAction(orderId, "amendment_requested", `Correction required: ${feedback.trim()}`);
}

/**
 * Requests an amendment on an approved order.
 */
export async function requestOrderAmendmentAction(
  orderId: string,
  amendmentNotes: string
): Promise<ActionResult> {
  return updateOrderStatusAction(orderId, "amendment_requested", amendmentNotes);
}

/**
 * Saves or updates a draft order.
 */
export async function saveOrderDraftAction(
  input: CreateOrderInput
): Promise<ActionResult<{ orderId: string }>> {
  try {
    if (!input.branchId || !UUID_REGEX.test(input.branchId)) {
      return {
        success: false,
        message: "A valid branch UUID is required to save a draft order.",
        error: "INVALID_IDENTIFIER",
      };
    }

    const auth = await validateBranchAdminAction(input.branchId);
    if (!auth.isAuthorized) {
      return {
        success: false,
        message: auth.message || "Unauthorized.",
        error: "FORBIDDEN",
      };
    }

    const supabase = await createServerSupabaseClient();
    const weekStart = input.weekStart || getDefaultWeekStart();

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert({
        branch_id: input.branchId,
        week_start: weekStart,
        status: "draft",
        notes: input.notes || null,
        created_by: auth.user!.id,
      })
      .select("id")
      .single();

    if (orderError || !orderData) {
      return {
        success: false,
        message: `Failed to save draft: ${orderError?.message}`,
        error: orderError?.code || "DB_ERROR",
      };
    }

    if (input.items && input.items.length > 0) {
      for (const it of input.items) {
        if (!it.productId || !UUID_REGEX.test(it.productId) || it.requestedQuantity <= 0) {
          // Clean up draft order if items are invalid
          await supabase.from("orders").delete().eq("id", orderData.id);
          return {
            success: false,
            message: `Invalid product quantity or ID format in draft items.`,
            error: "INVALID_ITEM",
          };
        }
      }

      const itemsToInsert = input.items.map((it) => ({
        order_id: orderData.id,
        product_id: it.productId,
        requested_quantity: it.requestedQuantity,
        approved_quantity: 0,
      }));
      const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert);
      if (itemsError) {
        // Roll back newly created draft order to prevent orphaned draft
        await supabase.from("orders").delete().eq("id", orderData.id);
        return {
          success: false,
          message: `Failed to save draft order items; rolled back draft: ${itemsError.message}`,
          error: itemsError.code || "DB_ERROR",
        };
      }
    }

    return {
      success: true,
      message: "Draft saved successfully.",
      data: { orderId: orderData.id },
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to save draft.",
      error: "SERVER_ERROR",
    };
  }
}

/**
 * Confirms shipment receipt for a branch's delivery.
 */
export async function confirmOrderReceiptAction(data: {
  orderId: string;
  dispatchId?: string;
  receiptStatus?: "intact" | "discrepancy" | "rejected";
  notes?: string;
  items?: {
    quantityExpected: number;
    quantityReceived?: number;
    discrepancyNote?: string;
  }[];
  receivedMap?: Record<string, number>;
  missingMap?: Record<string, number>;
  damagedMap?: Record<string, number>;
}): Promise<ActionResult> {
  try {
    const auth = await validateAuthenticatedAction();
    if (!auth.isAuthorized) {
      return { success: false, message: "Authentication required.", error: "UNAUTHENTICATED" };
    }

    if (!data.orderId || !UUID_REGEX.test(data.orderId)) {
      return {
        success: false,
        message: "Invalid order identifier format (UUID required).",
        error: "INVALID_IDENTIFIER",
      };
    }

    if (data.dispatchId && !UUID_REGEX.test(data.dispatchId)) {
      return {
        success: false,
        message: "Invalid dispatch identifier format (UUID required).",
        error: "INVALID_IDENTIFIER",
      };
    }

    const supabase = await createServerSupabaseClient();

    // Resolve dispatch ID if not explicitly passed
    let dispatchId = data.dispatchId;
    if (!dispatchId) {
      const { data: stopData } = await supabase
        .from("dispatch_orders")
        .select("dispatch_id")
        .eq("order_id", data.orderId)
        .maybeSingle();

      dispatchId = stopData?.dispatch_id;

      if (!dispatchId) {
        const { data: dispatchData } = await supabase
          .from("dispatches")
          .select("id")
          .eq("order_id", data.orderId)
          .maybeSingle();

        dispatchId = dispatchData?.id || data.orderId;
      }
    }

    // Determine status
    let status = data.receiptStatus;
    if (!status) {
      const hasMissing = data.missingMap && Object.values(data.missingMap).some((v) => v > 0);
      const hasDamaged = data.damagedMap && Object.values(data.damagedMap).some((v) => v > 0);
      status = hasMissing || hasDamaged ? "discrepancy" : "intact";
    }

    // Build items list
    let receiptItems = data.items || [];
    if (receiptItems.length === 0 && data.receivedMap) {
      receiptItems = Object.entries(data.receivedMap).map(([pId, received]) => {
        const missing = data.missingMap?.[pId] || 0;
        const damaged = data.damagedMap?.[pId] || 0;
        return {
          productId: pId,
          quantityExpected: received + missing,
          quantityReceived: received,
          discrepancyNote:
            missing > 0 || damaged > 0
              ? `Missing: ${missing}, Damaged: ${damaged}`
              : undefined,
        };
      });
    }

    // 1. Try atomic RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc("rpc_confirm_receipt", {
      p_dispatch_id: dispatchId,
      p_order_id: data.orderId,
      p_receipt_status: status,
      p_notes: data.notes || null,
      p_items: receiptItems.map((i) => ({
        product_id: (i as any).productId || (i as any).product_id || null,
        quantity_expected: i.quantityExpected,
        quantity_received: i.quantityReceived ?? i.quantityExpected,
        discrepancy_note: i.discrepancyNote || null,
      })),
    });

    if (rpcError) {
      return {
        success: false,
        message: rpcError.message || "Failed to confirm receipt.",
        error: rpcError.code || "RPC_ERROR",
      };
    }

    if (rpcData && (rpcData as any).success) {
      return {
        success: true,
        message: (rpcData as any).already_confirmed
          ? "Shipment receipt was already confirmed."
          : "Shipment receipt confirmed.",
      };
    }

    return {
      success: false,
      message: "Unexpected response from receipt confirmation service.",
      error: "UNEXPECTED_RESPONSE",
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to confirm receipt.",
      error: "SERVER_ERROR",
    };
  }
}

/**
 * Retrieves canonical order records from Supabase.
 * Enforces role-based visibility: Super Admin and Delivery Staff see network orders;
 * Branch Admins are isolated to their authorized branch only.
 */
export async function getOrdersAction(): Promise<ActionResult<AdminOrder[]>> {
  try {
    const auth = await validateAuthenticatedAction();
    if (!auth.isAuthorized || !auth.profile) {
      return {
        success: false,
        message: "Authentication required to view orders.",
        error: "UNAUTHENTICATED",
      };
    }

    const normalizedRole = auth.profile.role.toLowerCase().replace(/-/g, "_");
    const supabase = await createServerSupabaseClient();

    let dbOrders: any[] | null = null;
    const { data: rpcData, error: rpcErr } = await supabase.rpc("rpc_get_orders");
    if (!rpcErr && Array.isArray(rpcData)) {
      dbOrders = rpcData;
    } else {
      let query = supabase
        .from("orders")
        .select(`
          id,
          order_number,
          branch_id,
          week_start,
          status,
          notes,
          submitted_at,
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
              status,
              dispatch_number
            )
          )
        `)
        .order("created_at", { ascending: false });

      // Branch Admin isolation: strictly filter by assigned branch
      if (normalizedRole === "branch_admin") {
        if (!auth.profile.branch_id) {
          return {
            success: true,
            data: [],
            message: "No branch assigned to authenticated profile.",
          };
        }
        query = query.eq("branch_id", auth.profile.branch_id);
      }

      const { data, error: dbError } = await query;

      if (dbError) {
        return {
          success: false,
          message: dbError.message || "Failed to fetch orders.",
          error: dbError.code || "DB_ERROR",
        };
      }
      dbOrders = data;
    }

    if (!dbOrders) {
      return { success: true, message: "No orders found.", data: [] };
    }

    const mappedOrders: AdminOrder[] = dbOrders.map((ord: any) => {
      const branch = Array.isArray(ord.branches) ? ord.branches[0] : ord.branches;
      const rawItems = Array.isArray(ord.order_items) ? ord.order_items : [];
      const items: OrderItem[] = rawItems.map((it: any) => {
        const prod = Array.isArray(it.products) ? it.products[0] : it.products;
        const requestedPacks = Number(it.requested_quantity) || 0;
        const approvedPacks = Number(it.approved_quantity) || 0;
        return {
          productId: it.product_id,
          productName: prod?.name || "Handcrafted Stick",
          sku: prod?.sku || "SKU-STICK",
          packType: "Box of 10 Sticks (1 Crate)",
          requestedPacks,
          requestedUnits: requestedPacks * 10,
          approvedPacks,
          approvedUnits: approvedPacks * 10,
        };
      });

      const totalCrates = items.reduce((sum, it) => sum + it.requestedPacks, 0);
      const totalUnitsRequested = totalCrates * 10;
      const submittedDate = ord.submitted_at ? new Date(ord.submitted_at) : new Date(ord.created_at);
      const timestamp = !isNaN(submittedDate.getTime())
        ? submittedDate.toLocaleDateString("en-IN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Recent";

      const rawStops = Array.isArray(ord.dispatch_orders) ? ord.dispatch_orders : [];
      const activeStop = rawStops.find((st: any) => {
        const d = Array.isArray(st.dispatches) ? st.dispatches[0] : st.dispatches;
        return d && !["completed", "cancelled", "failed"].includes(d?.status);
      });
      const assignedDispatchId = activeStop?.dispatch_id || undefined;
      const normalizedDbStatus = (ord.status?.replace(/_/g, "-") || "submitted") as OrderStatus;
      const effectiveStatus: OrderStatus = assignedDispatchId && normalizedDbStatus !== "delivered" && normalizedDbStatus !== "cancelled"
        ? "dispatched"
        : normalizedDbStatus;

      return {
        id: ord.id,
        orderNumber: `ORD-2026-${ord.order_number}`,
        branchId: ord.branch_id,
        branchName: branch?.name || "Ice Spot Parlour",
        branchCode: branch?.code || `BR-${ord.branch_id.slice(0, 3).toUpperCase()}`,
        destinationFactory: "Varavoor Factory",
        district: branch?.district || "Thrissur",
        submittedAt: timestamp,
        requestedDeliveryDate: ord.week_start || "Next Scheduled Run",
        status: effectiveStatus,
        assignedDispatchId,
        totalUnitsRequested,
        totalUnitsApproved: items.reduce((sum, it) => sum + it.approvedUnits, 0),
        branchNotes: ord.notes || "",
        factoryNotes: ord.notes || undefined,
        items,
        timeline: [
          {
            id: `tl-${ord.id}-1`,
            timestamp,
            status: (ord.status?.replace(/_/g, "-") || "submitted") as OrderStatus,
            actorName: branch?.name ? `${branch.name} Admin` : "Branch Admin",
            actorRole: "Branch Admin",
            note: `Order submitted to Varavoor Factory (${totalCrates} crates / ${totalUnitsRequested} sticks)`,
          },
        ],
      };
    });

    return {
      success: true,
      message: "Orders retrieved successfully.",
      data: mappedOrders,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to fetch orders from server.",
      error: "SERVER_ERROR",
    };
  }
}
