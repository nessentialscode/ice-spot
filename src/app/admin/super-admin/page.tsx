import { requireAdminRole } from "@/lib/supabase/server-auth";
import { SuperAdminView } from "./SuperAdminView";

export default async function SuperAdminPage() {
  // Server-side authentication and role guard: strict super_admin enforcement
  const { user, profile } = await requireAdminRole(["super_admin"]);

  return <SuperAdminView userEmail={profile.email || user.email || undefined} />;
}
