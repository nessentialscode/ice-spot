export type UserRole = "super_admin" | "branch_admin" | "delivery_staff";

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  branch_id: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string | null;
}

/**
 * Resolves the dashboard URL path for a given role.
 */
export function getDashboardPathForRole(role: string): string | null {
  const normalized = role.toLowerCase().replace(/-/g, "_");
  if (normalized === "super_admin") return "/admin/super-admin";
  if (normalized === "branch_admin") return "/admin/branch";
  if (normalized === "delivery_staff") return "/admin/delivery";
  return null;
}
