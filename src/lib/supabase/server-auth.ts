import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "./server";
import { type UserProfile, getDashboardPathForRole } from "./auth-utils";

export type { UserProfile };
export { getDashboardPathForRole };

export interface AuthValidationResult {
  user: { id: string; email?: string } | null;
  profile: UserProfile | null;
  error?: "unauthenticated" | "profile_missing" | "profile_inactive" | "forbidden";
}

/**
 * Validates the currently authenticated Supabase session on the server
 * and retrieves the verified profile from public.profiles.
 * Enforces is_active = true and never trusts client-side state.
 */
export async function getAuthenticatedProfile(): Promise<AuthValidationResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { user: null, profile: null, error: "unauthenticated" };
    }

    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role, branch_id, is_active, created_at, updated_at")
      .eq("id", user.id)
      .single();

    const profile = data as UserProfile | null;

    if (profileError || !profile) {
      return {
        user: { id: user.id, email: user.email },
        profile: null,
        error: "profile_missing",
      };
    }

    if (!profile.is_active) {
      return {
        user: { id: user.id, email: user.email },
        profile: null,
        error: "profile_inactive",
      };
    }

    return { user: { id: user.id, email: user.email }, profile, error: undefined };
  } catch {
    return { user: null, profile: null, error: "unauthenticated" };
  }
}

/**
 * Server-side guard for protected Admin routes.
 * Enforces authentication, profile existence, active status, and role authorization.
 * Redirects unauthorized users to their verified dashboard or the login screen.
 */
export async function requireAdminRole(allowedRoles: string[]): Promise<{
  user: { id: string; email?: string };
  profile: UserProfile;
}> {
  const { user, profile, error } = await getAuthenticatedProfile();

  if (!user || error === "unauthenticated") {
    redirect("/admin");
  }

  if (!profile || error === "profile_missing" || error === "profile_inactive") {
    redirect(`/admin?error=${error}`);
  }

  const normalizedProfileRole = profile.role.toLowerCase().replace(/-/g, "_");
  const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase().replace(/-/g, "_"));

  if (!normalizedAllowed.includes(normalizedProfileRole)) {
    // Prevent cross-role URL navigation by redirecting to user's assigned dashboard
    const userDashboard = getDashboardPathForRole(profile.role);
    if (userDashboard) {
      redirect(userDashboard);
    }
    redirect("/admin?error=forbidden");
  }

  return { user, profile };
}

/**
 * Validates that the request comes from an authenticated, active user with Super Admin privileges.
 * For use in Server Actions (returns structured result instead of redirecting).
 */
export async function validateSuperAdminAction(): Promise<{
  isAuthorized: boolean;
  user?: { id: string; email?: string };
  profile?: UserProfile;
  error?: string;
  message?: string;
}> {
  const { user, profile, error } = await getAuthenticatedProfile();

  if (!user || error === "unauthenticated") {
    return {
      isAuthorized: false,
      error: "UNAUTHENTICATED",
      message: "Authentication required to perform administrative operations.",
    };
  }

  if (!profile || error === "profile_missing") {
    return {
      isAuthorized: false,
      error: "PROFILE_MISSING",
      message: "No profile found for authenticated account.",
    };
  }

  if (!profile.is_active || error === "profile_inactive") {
    return {
      isAuthorized: false,
      error: "PROFILE_INACTIVE",
      message: "Account is deactivated. Access denied.",
    };
  }

  const normalizedRole = profile.role.toLowerCase().replace(/-/g, "_");
  if (normalizedRole !== "super_admin") {
    return {
      isAuthorized: false,
      error: "FORBIDDEN",
      message: "Super Admin authority required for this operation.",
    };
  }

  return { isAuthorized: true, user, profile };
}

/**
 * Validates that the request comes from an authenticated, active user.
 * For use in Server Actions.
 */
export async function validateAuthenticatedAction(): Promise<{
  isAuthorized: boolean;
  user?: { id: string; email?: string };
  profile?: UserProfile;
  error?: string;
  message?: string;
}> {
  const { user, profile, error } = await getAuthenticatedProfile();

  if (!user || error === "unauthenticated") {
    return {
      isAuthorized: false,
      error: "UNAUTHENTICATED",
      message: "Authentication required.",
    };
  }

  if (!profile || error === "profile_missing" || !profile.is_active || error === "profile_inactive") {
    return {
      isAuthorized: false,
      error: "PROFILE_INACTIVE",
      message: "Active profile required.",
    };
  }

  return { isAuthorized: true, user, profile };
}

/**
 * Validates that the request comes from an authenticated, active user with Branch Admin (or Super Admin) privileges.
 * If targetBranchId is specified and the user is a Branch Admin, strictly enforces that they can only access/modify their assigned branch UUID.
 */
export async function validateBranchAdminAction(targetBranchId?: string): Promise<{
  isAuthorized: boolean;
  user?: { id: string; email?: string };
  profile?: UserProfile;
  error?: string;
  message?: string;
}> {
  const { user, profile, error } = await getAuthenticatedProfile();

  if (!user || error === "unauthenticated") {
    return {
      isAuthorized: false,
      error: "UNAUTHENTICATED",
      message: "Authentication required.",
    };
  }

  if (!profile || error === "profile_missing" || !profile.is_active || error === "profile_inactive") {
    return {
      isAuthorized: false,
      error: "PROFILE_INACTIVE",
      message: "Active profile required.",
    };
  }

  const normalizedRole = profile.role.toLowerCase().replace(/-/g, "_");
  if (normalizedRole !== "branch_admin" && normalizedRole !== "super_admin") {
    return {
      isAuthorized: false,
      error: "FORBIDDEN",
      message: "Branch Admin privileges required.",
    };
  }

  // Branch isolation: If branch_admin, they can only modify their assigned branch UUID
  if (normalizedRole === "branch_admin" && targetBranchId) {
    if (!profile.branch_id || profile.branch_id.toLowerCase() !== targetBranchId.toLowerCase()) {
      return {
        isAuthorized: false,
        error: "BRANCH_ISOLATION_VIOLATION",
        message: "Unauthorized: You may only manage your own assigned branch.",
      };
    }
  }

  return { isAuthorized: true, user, profile };
}

/**
 * Validates that the request comes from an authenticated, active Delivery Staff member (or Super Admin).
 */
export async function validateDeliveryStaffAction(): Promise<{
  isAuthorized: boolean;
  user?: { id: string; email?: string };
  profile?: UserProfile;
  error?: string;
  message?: string;
}> {
  const { user, profile, error } = await getAuthenticatedProfile();

  if (!user || error === "unauthenticated") {
    return {
      isAuthorized: false,
      error: "UNAUTHENTICATED",
      message: "Authentication required.",
    };
  }

  if (!profile || error === "profile_missing" || !profile.is_active || error === "profile_inactive") {
    return {
      isAuthorized: false,
      error: "PROFILE_INACTIVE",
      message: "Active profile required.",
    };
  }

  const normalizedRole = profile.role.toLowerCase().replace(/-/g, "_");
  if (normalizedRole !== "delivery_staff" && normalizedRole !== "super_admin") {
    return {
      isAuthorized: false,
      error: "FORBIDDEN",
      message: "Delivery Staff privileges required.",
    };
  }

  return { isAuthorized: true, user, profile };
}

export type BranchResolutionStatus =
  | "authorized"
  | "super_admin_authorized"
  | "super_admin_unassigned"
  | "profile_unassigned"
  | "malformed_uuid"
  | "branch_not_found"
  | "branch_inactive"
  | "query_error"
  | "forbidden";

export interface VerifiedBranchInfo {
  id: string;
  name: string;
  code: string;
  category?: string | null;
  address?: string | null;
  locality?: string | null;
  district?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  is_active: boolean;
}

export interface BranchResolutionResult {
  status: BranchResolutionStatus;
  branch: VerifiedBranchInfo | null;
  availableBranches: VerifiedBranchInfo[];
  error?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pure, deterministic evaluation of a user profile and branch identity.
 * Evaluates the 7 core profile/branch resolution cases without side-effects.
 */
export function evaluateBranchResolution(
  profile: UserProfile | null,
  branchRecord: VerifiedBranchInfo | null,
  dbError: { message: string } | null = null,
  availableBranches: VerifiedBranchInfo[] = [],
  selectedBranchId?: string
): BranchResolutionResult {
  if (!profile) {
    return {
      status: "profile_unassigned",
      branch: null,
      availableBranches: [],
      error: "No user profile found for authenticated account.",
    };
  }

  const normalizedRole = profile.role.toLowerCase().replace(/-/g, "_");

  // Case 1: Branch Admin
  if (normalizedRole === "branch_admin") {
    if (!profile.branch_id) {
      return {
        status: "profile_unassigned",
        branch: null,
        availableBranches: [],
        error:
          "Your account has the Branch Admin role, but no branch is linked in your database profile (profiles.branch_id is null). Please contact the Super Administrator to assign your branch UUID.",
      };
    }

    if (!UUID_REGEX.test(profile.branch_id)) {
      return {
        status: "malformed_uuid",
        branch: null,
        availableBranches: [],
        error: `Assigned branch identifier "${profile.branch_id}" is malformed. A valid UUID is required.`,
      };
    }

    if (dbError) {
      return {
        status: "query_error",
        branch: null,
        availableBranches: [],
        error: `Database query error while loading branch record: ${dbError.message}`,
      };
    }

    if (!branchRecord) {
      return {
        status: "branch_not_found",
        branch: null,
        availableBranches: [],
        error: `The branch assigned to your profile (${profile.branch_id}) does not exist in the public.branches registry.`,
      };
    }

    if (!branchRecord.is_active) {
      return {
        status: "branch_inactive",
        branch: branchRecord,
        availableBranches: [],
        error: `Assigned branch "${branchRecord.name}" (${branchRecord.code}) is marked inactive. Order submissions are disabled.`,
      };
    }

    return {
      status: "authorized",
      branch: branchRecord,
      availableBranches: [branchRecord],
    };
  }

  // Case 2: Super Admin (auditing and managing branch replenishment across network)
  if (normalizedRole === "super_admin") {
    if (dbError) {
      return {
        status: "query_error",
        branch: null,
        availableBranches: [],
        error: `Database query error loading franchise branches: ${dbError.message}`,
      };
    }

    if (!availableBranches || availableBranches.length === 0) {
      return {
        status: "super_admin_unassigned",
        branch: null,
        availableBranches: [],
        error: "No active branches found in the database registry.",
      };
    }

    let activeBranch: VerifiedBranchInfo | null = null;
    if (selectedBranchId && UUID_REGEX.test(selectedBranchId)) {
      activeBranch = availableBranches.find((b) => b.id.toLowerCase() === selectedBranchId.toLowerCase()) || null;
    }

    if (!activeBranch) {
      activeBranch =
        availableBranches.find((b) => b.code === "BR-OLL-003" || b.name.toLowerCase().includes("ollur")) ||
        availableBranches[0];
    }

    return {
      status: "super_admin_authorized",
      branch: activeBranch,
      availableBranches,
    };
  }

  return {
    status: "forbidden",
    branch: null,
    availableBranches: [],
    error: `User role "${profile.role}" is not authorized for branch replenishment order desk.`,
  };
}

/**
 * Resolves the authenticated user's branch identity directly from the database catalogs.
 * Distinguishes unassigned profiles, malformed UUIDs, deleted branches, inactive branches,
 * and RLS query errors with actionable diagnostic messages.
 */
export async function resolveBranchIdentityForProfile(
  profile: UserProfile | null,
  selectedBranchId?: string
): Promise<BranchResolutionResult> {
  if (!profile) {
    return evaluateBranchResolution(null, null);
  }

  const normalizedRole = profile.role.toLowerCase().replace(/-/g, "_");

  if (normalizedRole === "branch_admin") {
    if (!profile.branch_id || !UUID_REGEX.test(profile.branch_id)) {
      return evaluateBranchResolution(profile, null);
    }

    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, code, category, address, locality, district, contact_name, contact_phone, is_active")
        .eq("id", profile.branch_id)
        .maybeSingle();

      if (error) {
        return evaluateBranchResolution(profile, null, error);
      }

      return evaluateBranchResolution(profile, data as VerifiedBranchInfo | null);
    } catch (err: any) {
      return evaluateBranchResolution(profile, null, { message: err?.message || "Unknown error" });
    }
  }

  if (normalizedRole === "super_admin") {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, code, category, address, locality, district, contact_name, contact_phone, is_active")
        .eq("is_active", true)
        .order("code", { ascending: true });

      if (error) {
        return evaluateBranchResolution(profile, null, error);
      }

      const branches = (data || []) as VerifiedBranchInfo[];
      return evaluateBranchResolution(profile, null, null, branches, selectedBranchId);
    } catch (err: any) {
      return evaluateBranchResolution(profile, null, { message: err?.message || "Unknown error" });
    }
  }

  return evaluateBranchResolution(profile, null);
}
