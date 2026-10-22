import { requireAdminRole } from "@/lib/supabase/server-auth";
import { DeliveryStaffView } from "./DeliveryStaffView";

export default async function DeliveryStaffPage() {
  // Server-side authentication and role guard: strict delivery_staff enforcement
  const { user, profile } = await requireAdminRole(["delivery_staff"]);

  return <DeliveryStaffView userEmail={profile.email || user.email || undefined} />;
}
