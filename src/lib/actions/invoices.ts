"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  validateAuthenticatedAction,
  validateSuperAdminAction,
} from "@/lib/supabase/server-auth";
import { Invoice } from "@/types/admin";

export interface ActionResult<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

/**
 * Retrieves the persistent invoice for a given order ID.
 * Enforces strict branch-isolation: branch admins can only view their own invoices.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getInvoiceForOrderAction(
  orderId: string
): Promise<ActionResult<Invoice>> {
  try {
    const auth = await validateAuthenticatedAction();
    if (!auth.isAuthorized || !auth.profile) {
      return {
        success: false,
        message: "Authentication required to access invoice.",
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

    // 1. Fetch order to verify branch ownership and existence
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_number, branch_id, status")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return {
        success: false,
        message: "Referenced order not found.",
        error: "NOT_FOUND",
      };
    }

    // Branch isolation check
    const isSuperAdmin = auth.profile.role === "super_admin";
    if (!isSuperAdmin && auth.profile.branch_id !== order.branch_id) {
      return {
        success: false,
        message: "Unauthorized: Cannot access an invoice belonging to another branch.",
        error: "FORBIDDEN",
      };
    }

    // 2. Fetch invoice with items and branch details
    let { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        order_id,
        branch_id,
        invoice_date,
        subtotal,
        tax_rate,
        tax_amount,
        grand_total,
        status,
        notes,
        created_at,
        branches (
          id,
          name,
          code,
          address,
          locality,
          district,
          contact_phone
        ),
        invoice_items (
          id,
          product_id,
          quantity,
          unit_price,
          line_total,
          products (
            id,
            name,
            sku
          )
        )
      `)
      .eq("order_id", orderId)
      .maybeSingle();

    // 3. If invoice not yet generated and order is approved, generate it idempotently
    if (!invoice && ["approved", "preparation", "ready_for_dispatch", "dispatched", "delivered", "partially_delivered"].includes(order.status)) {
      const { data: genData, error: genErr } = await supabase.rpc("rpc_generate_invoice", {
        p_order_id: orderId,
      });

      if (!genErr && genData && (genData as any).success) {
        // Re-fetch created invoice
        const refetch = await supabase
          .from("invoices")
          .select(`
            id,
            invoice_number,
            order_id,
            branch_id,
            invoice_date,
            subtotal,
            tax_rate,
            tax_amount,
            grand_total,
            status,
            notes,
            created_at,
            branches (
              id,
              name,
              code,
              address,
              locality,
              district,
              contact_phone
            ),
            invoice_items (
              id,
              product_id,
              quantity,
              unit_price,
              line_total,
              products (
                id,
                name,
                sku
              )
            )
          `)
          .eq("order_id", orderId)
          .maybeSingle();

        invoice = refetch.data;
      }
    }

    if (!invoice) {
      return {
        success: false,
        message: "No invoice available for this order.",
        error: "NOT_FOUND",
      };
    }

    const branch = (invoice as any).branches;
    const mappedItems = ((invoice as any).invoice_items || []).map((it: any) => ({
      id: it.id,
      productId: it.product_id,
      productName: it.products?.name || "Handcrafted Stick",
      sku: it.products?.sku || "SKU-STICK",
      quantity: Number(it.quantity),
      unitPrice: Number(it.unit_price),
      lineTotal: Number(it.line_total),
    }));

    const result: Invoice = {
      id: invoice.id,
      invoiceNumber: `INV-2026-${String(invoice.invoice_number).padStart(5, "0")}`,
      orderId: invoice.order_id,
      orderNumber: String(order.order_number),
      branchId: invoice.branch_id,
      branchName: branch?.name || "Branch Parlour",
      branchCode: branch?.code,
      branchAddress: branch?.address || branch?.locality || "Kerala, India",
      branchPhone: branch?.contact_phone,
      district: branch?.district || "Thrissur",
      invoiceDate: invoice.invoice_date,
      subtotal: Number(invoice.subtotal),
      taxRate: Number(invoice.tax_rate),
      taxAmount: Number(invoice.tax_amount),
      grandTotal: Number(invoice.grand_total),
      status: invoice.status as any,
      items: mappedItems,
      notes: invoice.notes,
      createdAt: invoice.created_at,
    };

    return {
      success: true,
      message: "Invoice retrieved successfully.",
      data: result,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to retrieve invoice.",
      error: "SERVER_ERROR",
    };
  }
}

/**
 * Generates an invoice for an approved order.
 * Strictly requires Super Admin authorization.
 */
export async function generateInvoiceAction(
  orderId: string
): Promise<ActionResult<{ invoiceId: string; invoiceNumber: number | string }>> {
  try {
    const auth = await validateSuperAdminAction();
    if (!auth.isAuthorized) {
      return {
        success: false,
        message: auth.message || "Unauthorized: Super Admin privileges required.",
        error: auth.error || "FORBIDDEN",
      };
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("rpc_generate_invoice", {
      p_order_id: orderId,
    });

    if (error) {
      return {
        success: false,
        message: error.message || "Failed to generate invoice.",
        error: error.code || "RPC_ERROR",
      };
    }

    if (data && (data as any).success) {
      return {
        success: true,
        message: (data as any).already_exists
          ? "Invoice already exists for this order."
          : "Invoice generated successfully.",
        data: {
          invoiceId: (data as any).invoice_id,
          invoiceNumber: (data as any).invoice_number,
        },
      };
    }

    return {
      success: false,
      message: "Unexpected response from invoice generation service.",
      error: "UNEXPECTED_RESPONSE",
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to generate invoice.",
      error: "SERVER_ERROR",
    };
  }
}
