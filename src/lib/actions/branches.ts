"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  validateSuperAdminAction,
  validateAuthenticatedAction,
} from "@/lib/supabase/server-auth";

export interface ActionResult<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

/**
 * Toggles a single branch's Active (Open/Closed) status in the database.
 * Strictly requires active Super Admin authorization matching database RLS policies.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    if (!branchId || !UUID_REGEX.test(branchId)) {
      return {
        success: false,
        message: "Invalid branch identifier format (UUID required).",
        error: "INVALID_IDENTIFIER",
      };
    }

    const supabase = await createServerSupabaseClient();

    // Update branch is_active in Supabase
    const { data: updatedRows, error: updateError } = await supabase
      .from("branches")
      .update({
        is_active: isOpen,
        updated_at: new Date().toISOString(),
      })
      .eq("id", branchId)
      .select("id");

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
        message: `Branch ${branchId} not found or no rows were updated.`,
        error: "BRANCH_NOT_FOUND",
      };
    }

    // Audit log
    if (auth.user?.id) {
      await supabase.from("audit_logs").insert({
        actor_id: auth.user.id,
        action: isOpen ? "BRANCH_ACTIVATED" : "BRANCH_DEACTIVATED",
        entity_type: "branch",
        entity_id: branchId,
        details: { isActive: isOpen, actorRole: auth.profile?.role },
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

    const { data: updatedRows, error: updateError } = await supabase
      .from("branches")
      .update({
        is_active: isOpen,
        updated_at: new Date().toISOString(),
      })
      .neq("code", "BR-VRV-001") // Preserve central factory hub active status
      .select("id");

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
        message: "No branches were updated.",
        error: "NO_BRANCHES_UPDATED",
      };
    }

    if (auth.user?.id) {
      await supabase.from("audit_logs").insert({
        actor_id: auth.user.id,
        action: isOpen ? "ALL_BRANCHES_OPENED" : "ALL_BRANCHES_CLOSED",
        entity_type: "network",
        details: { isOpen },
      });
    }

    return {
      success: true,
      message: `All network branches marked as ${isOpen ? "OPEN" : "CLOSED"}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to update branches.",
      error: "SERVER_ERROR",
    };
  }
}

/**
 * Reads a branch's current active status from the database.
 */
export async function getBranchStatusAction(
  branchId: string
): Promise<ActionResult<{ isOpen: boolean }>> {
  try {
    if (!branchId || !UUID_REGEX.test(branchId)) {
      return {
        success: false,
        message: "Invalid branch identifier format (UUID required).",
        error: "INVALID_IDENTIFIER",
      };
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("branches")
      .select("is_active")
      .eq("id", branchId)
      .single();

    if (error || !data) {
      return {
        success: false,
        message: "Branch record not found.",
        error: "NOT_FOUND",
      };
    }

    return {
      success: true,
      message: "Branch status retrieved.",
      data: { isOpen: data.is_active },
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to retrieve status.",
      error: "SERVER_ERROR",
    };
  }
}
