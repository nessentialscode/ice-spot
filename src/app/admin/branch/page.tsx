import {
  requireAdminRole,
  resolveBranchIdentityForProfile,
} from "@/lib/supabase/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BranchAdminView } from "./BranchAdminView";
import { AdminProduct } from "@/types/admin";

interface BranchAdminPageProps {
  searchParams?: Promise<{ branchId?: string }>;
}

export default async function BranchAdminPage({ searchParams }: BranchAdminPageProps) {
  // Server-side authentication and role guard: strict branch_admin enforcement
  const { user, profile } = await requireAdminRole(["branch_admin"]);

  const resolvedParams = searchParams ? await searchParams : undefined;
  const resolution = await resolveBranchIdentityForProfile(profile, resolvedParams?.branchId);

  // Load products from public.products with verified database UUIDs
  let products: AdminProduct[] | undefined = undefined;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: dbProducts, error: dbProductsErr } = await supabase
      .from("products")
      .select("id, sku, name, description, unit, selling_price, is_active")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (dbProductsErr) {
      console.warn("[BranchAdminPage] Error fetching database products:", dbProductsErr.message);
    }

    if (dbProducts && dbProducts.length > 0) {
      products = dbProducts.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.description || "Fruit Ice Stick",
        packType: "Box of 10 Sticks (1 Crate)",
        unitsPerPack: 10,
        imageUrl: "/assets/sticks/stick_strawberry.png",
        color: "#D83162",
        isAvailable: true,
        isActive: p.is_active,
        currentStock: 1000,
        reservedStock: 100,
        minStockAlert: 100,
      }));
    }
  } catch (err) {
    console.warn("[BranchAdminPage] Falling back to default products:", err);
  }

  // Check if target branch has an active order pending review
  let initialPendingOrder: {
    id: string;
    orderNumber: string;
    status: string;
    totalCrates: number;
    submittedAt: string;
  } | null = null;

  if (resolution.branch?.id) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data: pendingData } = await supabase
        .from("orders")
        .select("id, order_number, status, submitted_at, created_at, order_items(requested_quantity)")
        .eq("branch_id", resolution.branch.id)
        .in("status", ["submitted", "under_review"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendingData) {
        const rawItems = Array.isArray(pendingData.order_items) ? pendingData.order_items : [];
        const totalCrates = rawItems.reduce(
          (sum: number, it: any) => sum + (Number(it.requested_quantity) || 0),
          0
        );
        const submittedDate = pendingData.submitted_at
          ? new Date(pendingData.submitted_at)
          : new Date(pendingData.created_at);
        const formattedDate = !isNaN(submittedDate.getTime())
          ? submittedDate.toLocaleDateString("en-IN", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "Recent";

        initialPendingOrder = {
          id: pendingData.id,
          orderNumber: `ORD-2026-${pendingData.order_number}`,
          status: pendingData.status,
          totalCrates,
          submittedAt: formattedDate,
        };
      }
    } catch (err) {
      console.warn("[BranchAdminPage] Error querying pending order:", err);
    }
  }

  return (
    <BranchAdminView
      userEmail={user.email || undefined}
      userRole={profile.role}
      assignedBranchId={resolution.branch?.id}
      branchStatus={resolution.status}
      assignedBranch={resolution.branch}
      availableBranches={resolution.availableBranches}
      resolutionError={resolution.error}
      initialProducts={products}
      initialPendingOrder={initialPendingOrder}
    />
  );
}
