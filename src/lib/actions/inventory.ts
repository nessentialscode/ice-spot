"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateSuperAdminAction, validateAuthenticatedAction } from "@/lib/supabase/server-auth";

export interface ActionResult<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface CreateProductInput {
  id?: string;
  sku: string;
  name: string;
  description?: string;
  unit?: string;
  sellingPrice?: number;
  displayOrder?: number;
  category?: string;
  packType?: string;
  unitsPerPack?: number;
  currentStock?: number;
  minStockAlert?: number;
  color?: string;
  imageUrl?: string;
}



/**
 * Adjusts inventory stock level for a product in public.inventory and logs to audit_logs.
 * Strictly requires Super Admin authorization.
 * Never touches obsolete columns on public.products.
 */
export async function adjustInventoryAction(
  productId: string,
  changeAmount: number,
  reason: "Production Output" | "Damaged Stock" | "Inventory Audit" | "Manual Correction" | "Dispatch Fulfillment",
  branchId?: string | null
): Promise<ActionResult<{ productId: string; newStock: number }>> {
  try {
    const auth = await validateSuperAdminAction();
    if (!auth.isAuthorized) {
      return {
        success: false,
        message: auth.message || "Unauthorized: Super Admin privileges required.",
        error: auth.error || "FORBIDDEN",
      };
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!productId || !UUID_REGEX.test(productId)) {
      return {
        success: false,
        message: "Invalid product identifier format (UUID required).",
        error: "INVALID_UUID",
      };
    }

    if (branchId && !UUID_REGEX.test(branchId)) {
      return {
        success: false,
        message: "Invalid branch identifier format (UUID required).",
        error: "INVALID_UUID",
      };
    }

    if (changeAmount === 0 || !Number.isFinite(changeAmount)) {
      return {
        success: false,
        message: "Stock adjustment amount must be a non-zero finite number.",
        error: "INVALID_AMOUNT",
      };
    }

    const supabase = await createServerSupabaseClient();

    // 1. Try atomic RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc("rpc_adjust_inventory", {
      p_product_id: productId,
      p_branch_id: branchId || null,
      p_delta: changeAmount,
      p_reason: reason,
    });

    if (rpcError) {
      return {
        success: false,
        message: rpcError.message || "Failed to adjust inventory.",
        error: rpcError.code || "RPC_ERROR",
      };
    }

    if (rpcData && (rpcData as any).success) {
      return {
        success: true,
        message: `Inventory adjusted by ${changeAmount > 0 ? "+" : ""}${changeAmount}.`,
        data: {
          productId,
          newStock: Number((rpcData as any).quantity),
        },
      };
    }

    return {
      success: false,
      message: "Unexpected response from inventory service.",
      error: "UNEXPECTED_RESPONSE",
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to adjust inventory.",
      error: "SERVER_ERROR",
    };
  }
}

/**
 * Creates or updates a product in public.products.
 */
export async function createProductAction(
  input: CreateProductInput
): Promise<ActionResult<{ productId: string }>> {
  try {
    const auth = await validateSuperAdminAction();
    if (!auth.isAuthorized) {
      return {
        success: false,
        message: "Super Admin privileges required to manage products.",
        error: "FORBIDDEN",
      };
    }

    if (!input.name?.trim() || !input.sku?.trim()) {
      return {
        success: false,
        message: "Product name and SKU are required.",
        error: "VALIDATION_ERROR",
      };
    }

    const supabase = await createServerSupabaseClient();
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const insertPayload: Record<string, any> = {
      sku: input.sku.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      unit: input.unit || "pack",
      selling_price: input.sellingPrice ?? null,
      display_order: input.displayOrder ?? 0,
      is_active: true,
    };
    if (input.id && UUID_REGEX.test(input.id)) {
      insertPayload.id = input.id;
    }

    const { data, error } = await supabase
      .from("products")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error || !data) {
      const isDuplicate = error?.code === "23505" || error?.message?.includes("duplicate");
      return {
        success: false,
        message: isDuplicate
          ? `Product with SKU "${input.sku.trim()}" already exists.`
          : error?.message || "Failed to create product.",
        error: isDuplicate ? "DUPLICATE_SKU" : error?.code || "DB_ERROR",
      };
    }

    return {
      success: true,
      message: "Product created successfully.",
      data: { productId: data.id },
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to create product.",
      error: "SERVER_ERROR",
    };
  }
}

/**
 * Toggles a product active/inactive.
 */
export async function toggleProductActiveAction(
  productId: string,
  isActive: boolean
): Promise<ActionResult> {
  try {
    const auth = await validateSuperAdminAction();
    if (!auth.isAuthorized) {
      return { success: false, message: "Super Admin authority required.", error: "FORBIDDEN" };
    }

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("products")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", productId);

    if (error) {
      return { success: false, message: error.message, error: error.code };
    }

    return { success: true, message: `Product ${isActive ? "activated" : "deactivated"}.` };
  } catch (err: any) {
    return { success: false, message: err.message, error: "SERVER_ERROR" };
  }
}
