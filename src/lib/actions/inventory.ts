"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateSuperAdminAction } from "@/lib/supabase/server-auth";

export interface ActionResult<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface CreateProductInput {
  id?: string;
  name: string;
  sku: string;
  category: string;
  packType: string;
  unitsPerPack: number;
  currentStock: number;
  minStockAlert?: number;
  color?: string;
  imageUrl?: string;
}

/**
 * Adjusts factory stock level for a product and logs the change to audit_logs.
 * Strictly requires Super Admin authorization.
 * Handles database errors without falsely showing success.
 */
export async function adjustInventoryAction(
  productId: string,
  changeAmount: number,
  reason: "Production Output" | "Damaged Stock" | "Inventory Audit" | "Manual Correction" | "Dispatch Fulfillment"
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

    if (changeAmount === 0) {
      return {
        success: false,
        message: "Stock adjustment amount cannot be zero.",
        error: "INVALID_AMOUNT",
      };
    }

    const supabase = await createServerSupabaseClient();

    // 1. Fetch current product
    const { data: product, error: fetchError } = await supabase
      .from("products")
      .select("id, name, current_stock")
      .eq("id", productId)
      .single();

    if (fetchError || !product) {
      return {
        success: false,
        message: `Product record not found: ${fetchError?.message || productId}`,
        error: fetchError?.code || "NOT_FOUND",
      };
    }

    const currentStock = product.current_stock || 0;
    const newStock = Math.max(0, currentStock + changeAmount);

    // 2. Update product stock level
    const { error: updateError } = await supabase
      .from("products")
      .update({
        current_stock: newStock,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId);

    if (updateError) {
      return {
        success: false,
        message: updateError.message,
        error: updateError.code || "DB_ERROR",
      };
    }

    // 3. Write to audit_logs
    if (auth.user?.id) {
      await supabase.from("audit_logs").insert({
        user_id: auth.user.id,
        action: "ADJUST_INVENTORY",
        entity_type: "product",
        entity_id: productId,
        changes: {
          productName: product.name,
          changeAmount,
          previousStock: currentStock,
          newStock,
          reason,
          actor: auth.profile?.full_name || auth.user.email,
        },
      });
    }

    return {
      success: true,
      message: `Inventory for ${product.name} updated to ${newStock} units.`,
      data: { productId, newStock },
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
 * Registers a new handcrafted flavour / SKU in the factory catalogue.
 * Strictly requires Super Admin authorization.
 */
export async function createProductAction(
  input: CreateProductInput
): Promise<ActionResult<{ productId: string; sku: string }>> {
  try {
    const auth = await validateSuperAdminAction();
    if (!auth.isAuthorized) {
      return {
        success: false,
        message: auth.message || "Unauthorized: Super Admin privileges required.",
        error: auth.error || "FORBIDDEN",
      };
    }

    if (!input.name.trim() || !input.sku.trim()) {
      return {
        success: false,
        message: "Product name and SKU are required.",
        error: "VALIDATION_ERROR",
      };
    }

    const productId = input.id || `flv-${input.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now().toString(36).slice(-4)}`;
    const supabase = await createServerSupabaseClient();

    // 1. Check for duplicate SKU
    const { data: existingSku } = await supabase
      .from("products")
      .select("id, sku")
      .eq("sku", input.sku.trim())
      .maybeSingle();

    if (existingSku) {
      return {
        success: false,
        message: `Product SKU "${input.sku}" already exists. Please specify a unique SKU.`,
        error: "DUPLICATE_SKU",
      };
    }

    // 2. Insert into products
    const { error: insertError } = await supabase.from("products").insert({
      id: productId,
      name: input.name.trim(),
      sku: input.sku.trim().toUpperCase(),
      category: input.category,
      pack_type: input.packType,
      units_per_pack: input.unitsPerPack || 10,
      current_stock: Math.max(0, input.currentStock || 0),
      reserved_stock: 0,
      min_stock_alert: input.minStockAlert || 50,
      color: input.color || "#E22F62",
      image_url: input.imageUrl || "/images/flavours/default-stick.png",
      is_available: true,
      is_active: true,
    });

    if (insertError) {
      return {
        success: false,
        message: insertError.message,
        error: insertError.code || "DB_ERROR",
      };
    }

    // 3. Write to audit_logs
    if (auth.user?.id) {
      await supabase.from("audit_logs").insert({
        user_id: auth.user.id,
        action: "CREATE_PRODUCT",
        entity_type: "product",
        entity_id: productId,
        changes: {
          name: input.name,
          sku: input.sku,
          initialStock: input.currentStock,
          actor: auth.profile?.full_name || auth.user.email,
        },
      });
    }

    return {
      success: true,
      message: `Flavour "${input.name}" registered successfully in factory inventory.`,
      data: { productId, sku: input.sku },
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to create flavour product.",
      error: "SERVER_ERROR",
    };
  }
}
