import { requireAdminRole } from "@/lib/supabase/server-auth";
import { BranchAdminView } from "./BranchAdminView";

export default async function BranchAdminPage() {
  // Server-side authentication and role guard: strict branch_admin enforcement
  const { user, profile } = await requireAdminRole(["branch_admin"]);

  return <BranchAdminView userEmail={profile.email || user.email || undefined} />;
}
