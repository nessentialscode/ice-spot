"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateSuperAdminAction } from "@/lib/supabase/server-auth";

export interface ActionResult<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

/**
 * Toggles a single branch's Open/Closed status in the database.
 * Strictly requires active Super Admin authentication.
 */
export async function toggleBranchStatusAction(
  branchId: string,
  isOpen: boolean
): Promise<ActionResult> {
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

    // 1. Update branch in Supabase
    const { error: updateError } = await supabase
      .from("branches")
      .update({
        is_open: isOpen,
        status: isOpen ? "confirmed" : "closed",
      })
      .eq("id", branchId);

    if (updateError) {
      return {
        success: false,
        message: updateError.message,
        error: updateError.code || "DB_ERROR",
      };
    }

    // 2. Audit log
    if (auth.user?.id) {
      await supabase.from("audit_logs").insert({
        user_id: auth.user.id,
        action: isOpen ? "BRANCH_OPENED" : "BRANCH_CLOSED",
        entity_type: "branch",
        entity_id: branchId,
        changes: { isOpen, actor: auth.profile?.full_name || auth.user.email },
      });
    }

    return {
      success: true,
      message: `Branch status successfully updated to ${isOpen ? "OPEN" : "CLOSED"}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to update branch status.",
      error: "SERVER_ERROR",
    };
  }
}

/**
 * Sets all branches Open or Closed across the entire network.
 * Strictly requires active Super Admin authentication.
 */
export async function setAllBranchesStatusAction(
  isOpen: boolean
): Promise<ActionResult> {
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

    // Exclude factory headquarters from being marked closed if open
    const { error: updateError } = await supabase
      .from("branches")
      .update({
        is_open: isOpen,
        status: isOpen ? "confirmed" : "closed",
      })
      .neq("is_factory_headquarters", true);

    if (updateError) {
      return {
        success: false,
        message: updateError.message,
        error: updateError.code || "DB_ERROR",
      };
    }

    // Audit log
    if (auth.user?.id) {
      await supabase.from("audit_logs").insert({
        user_id: auth.user.id,
        action: isOpen ? "ALL_BRANCHES_OPENED" : "ALL_BRANCHES_CLOSED",
        entity_type: "network",
        changes: { isOpen, actor: auth.profile?.full_name || auth.user.email },
      });
    }

    return {
      success: true,
      message: `All network branches marked ${isOpen ? "OPEN" : "CLOSED"}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to update network branches.",
      error: "SERVER_ERROR",
    };
  }
}
