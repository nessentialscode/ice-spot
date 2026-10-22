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
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { user: null, profile: null, error: "unauthenticated" };
    }

    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    const profile = data as UserProfile | null;

    if (profileError || !profile) {
      return { user: { id: user.id, email: user.email }, profile: null, error: "profile_missing" };
    }

    if (!profile.is_active) {
      return { user: { id: user.id, email: user.email }, profile: null, error: "profile_inactive" };
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
