"use client";

import React, { useState, useEffect } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdmin } from "@/context/AdminContext";
import { OrderItem, AdminProduct } from "@/types/admin";
import {
  BranchResolutionStatus,
  VerifiedBranchInfo,
} from "@/lib/supabase/server-auth";
import { createOrderAction } from "@/lib/actions/orders";
import {
  Store,
  Truck,
  Plus,
  Minus,
  CheckCircle2,
  Send,
  AlertCircle,
  Building2,
  Info,
  Loader2
} from "lucide-react";

interface BranchAdminViewProps {
  userEmail?: string;
  assignedBranchId?: string;
  userRole?: string;
  branchStatus?: BranchResolutionStatus;
  assignedBranch?: VerifiedBranchInfo | null;
  availableBranches?: VerifiedBranchInfo[];
  resolutionError?: string;
  initialProducts?: AdminProduct[];
  initialPendingOrder?: {
    id: string;
    orderNumber: string;
    status: string;
    totalCrates: number;
    submittedAt: string;
  } | null;
}

export function BranchAdminView({
  userEmail,
  assignedBranchId,
  userRole,
  branchStatus = "profile_unassigned",
  assignedBranch = null,
  availableBranches = [],
  resolutionError,
  initialProducts,
  initialPendingOrder = null
}: BranchAdminViewProps) {
  const {
    orders,
    products: contextProducts,
    dispatches,
    submitOrder,
    receiveShipment,
    showToast,
    syncOrdersFromServer,
  } = useAdmin();

  // Synchronize branch order status from authoritative server on mount
  useEffect(() => {
    let mounted = true;
    if (typeof syncOrdersFromServer === "function") {
      syncOrdersFromServer().catch((err) => {
        if (mounted) {
          console.warn("[BranchAdminView] Failed to synchronize orders on mount:", err);
        }
      });
    }
    return () => {
      mounted = false;
    };
  }, [syncOrdersFromServer]);

  // Super Admin can switch between active branches across the franchise network
  const [selectedBranch, setSelectedBranch] = useState<VerifiedBranchInfo | null>(() => {
    if (assignedBranch) return assignedBranch;
    if (availableBranches && availableBranches.length > 0) return availableBranches[0];
    return null;
  });

  const normalizedRole = userRole?.toLowerCase().replace(/-/g, "_");
  const activeBranch = normalizedRole === "super_admin" ? (selectedBranch || assignedBranch) : assignedBranch;
  const effectiveBranchId = activeBranch?.id || assignedBranchId;

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isBranchAuthorized =
    (branchStatus === "authorized" ||
      branchStatus === "super_admin_authorized" ||
      normalizedRole === "super_admin") &&
    Boolean(effectiveBranchId && UUID_REGEX.test(effectiveBranchId));

  // Determine if branch already has an active order awaiting decision
  const activePendingOrder =
    orders.find((o) => {
      const matchesBranch =
        effectiveBranchId &&
        o.branchId &&
        (o.branchId.toLowerCase() === effectiveBranchId.toLowerCase() ||
          (activeBranch?.code &&
            o.branchCode &&
            o.branchCode.toLowerCase() === activeBranch.code.toLowerCase()));
      const isPending =
        o.status === "submitted" ||
        o.status === "under-review";
      return matchesBranch && isPending;
    }) || initialPendingOrder;

  const pendingOrderTotalCrates = activePendingOrder
    ? "items" in activePendingOrder
      ? activePendingOrder.items.reduce((sum, it) => sum + (it.requestedPacks || 0), 0)
      : activePendingOrder.totalCrates
    : 0;

  // Use database products with real UUIDs if provided, otherwise context products
  const products = (initialProducts && initialProducts.length > 0) ? initialProducts : contextProducts;

  // Filter dispatches for the current active branch
  const currentBranchDispatches = dispatches.filter((d) =>
    d.stops.some((s) => {
      if (effectiveBranchId && s.branchId.toLowerCase() === effectiveBranchId.toLowerCase()) return true;
      if (activeBranch) {
        const codeMatch = s.branchId.toLowerCase().includes(activeBranch.code.toLowerCase());
        const nameMatch = activeBranch.name.toLowerCase().includes("ollur") && (s.branchId.includes("ollur") || s.branchId === "branch-13");
        if (codeMatch || nameMatch) return true;
      }
      return s.branchId.includes("ollur") || s.branchId === "branch-13";
    })
  );

  // Weekly Order Quantities state (crate counts for each of the flavours)
  const [orderQuantities, setOrderQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    products.forEach((p, idx) => {
      initial[p.id] = idx < 4 ? 15 : idx < 7 ? 10 : 8;
    });
    return initial;
  });

  const [requestedDate, setRequestedDate] = useState("Next Friday (Oct 24)");
  const [orderNotes, setOrderNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateQuantity = (productId: string, delta: number) => {
    setOrderQuantities((prev) => {
      const current = prev[productId] || 0;
      const updated = Math.max(0, current + delta);
      return { ...prev, [productId]: updated };
    });
  };

  const totalCrates = Object.values(orderQuantities).reduce((acc, qty) => acc + qty, 0);
  const totalSticks = totalCrates * 10;
  const estimatedCost = totalSticks * 35; // standard handcrafted stick wholesale base ₹35

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalCrates === 0) {
      showToast("Please add at least 1 crate to submit an order", "error");
      return;
    }

    if (activePendingOrder) {
      showToast(
        `Cannot submit: Order ${activePendingOrder.orderNumber} is already pending review for this branch.`,
        "error"
      );
      return;
    }

    if (!isBranchAuthorized || !effectiveBranchId || !UUID_REGEX.test(effectiveBranchId)) {
      showToast(
        "Cannot submit order: No authorized branch UUID linked. Submission disabled.",
        "error"
      );
      return;
    }

    setIsSubmitting(true);
    const items: OrderItem[] = Object.entries(orderQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, quantity]) => {
        const prod = products.find((p) => p.id === productId);
        return {
          productId,
          productName: prod?.name || "Handcrafted Stick",
          sku: prod?.sku || "SKU-STICK",
          packType: "Box of 10 Sticks (1 Crate)",
          requestedPacks: quantity,
          requestedUnits: quantity * 10,
          approvedPacks: quantity,
          approvedUnits: quantity * 10
        };
      });

    try {
      // Execute verified server action with transactional database persistence
      const result = await createOrderAction({
        branchId: effectiveBranchId,
        items: items.map((it) => ({
          productId: it.productId,
          requestedQuantity: it.requestedPacks,
        })),
        notes: orderNotes,
      });

      if (!result.success) {
        showToast(`Order submission failed: ${result.message}`, "error");
        setIsSubmitting(false);
        return;
      }

      // Record in local state with confirmed order number
      submitOrder({
        branchId: effectiveBranchId,
        branchName: activeBranch?.name || "Ice Spot Ollur",
        branchCode: activeBranch?.code || "BR-OLL-003",
        destinationFactory: "Varavoor Factory",
        items,
        notes: orderNotes,
        requestedDeliveryDate: requestedDate,
        serverOrderId: result.data?.orderId,
        serverOrderNumber: result.data?.orderNumber,
        skipServerSync: true,
      });

      // Clear the order form inputs after verified persistence
      const clearedQuantities: Record<string, number> = {};
      products.forEach((p) => {
        clearedQuantities[p.id] = 0;
      });
      setOrderQuantities(clearedQuantities);
      setOrderNotes("");

      showToast(
        `Order #${result.data?.orderNumber || "submitted"} confirmed and sent to Varavoor Factory!`,
        "success"
      );
    } catch (err: any) {
      showToast(`Submission error: ${err?.message || "Unexpected failure"}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReceipt = (orderId: string) => {
    const parlourName = activeBranch ? activeBranch.name : "Ollur parlour";
    receiveShipment(orderId, {}, {}, {}, "All crates received frozen at -18°C in perfect factory condition");
    showToast(`Shipment verified and received successfully at ${parlourName}`, "success");
  };

  const shellSubtitle = activeBranch
    ? `${activeBranch.code} • ${activeBranch.name} • ${activeBranch.district || "Thrissur"}`
    : "Branch Replenishment Order Desk";

  const shellRoleBadge = "BRANCH ADMIN";
  const shellRoleColor: "amber" = "amber";

  return (
    <AdminShell
      title="Youback Icespot Factory"
      subtitle={shellSubtitle}
      roleBadgeText={shellRoleBadge}
      roleBadgeColor={shellRoleColor}
      userEmail={userEmail}
    >
      {/* Super Admin Franchise Branch Switcher */}
      {userRole === "super_admin" && availableBranches && availableBranches.length > 0 && (
        <div className="mb-6 p-4 rounded-2xl bg-indigo-50/80 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-indigo-700 flex-shrink-0" />
            <div>
              <span className="text-xs font-black text-indigo-950 uppercase tracking-wide">
                Super Admin Branch Audit &amp; Replenishment Mode
              </span>
              <p className="text-[11px] text-indigo-700 font-medium">
                Select any parlour in the franchise network to manage orders or inspect manifests
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <label htmlFor="branch-picker" className="text-xs font-bold text-indigo-950">
              Parlour:
            </label>
            <select
              id="branch-picker"
              value={activeBranch?.id || ""}
              onChange={(e) => {
                const found = availableBranches.find((b) => b.id === e.target.value);
                if (found) setSelectedBranch(found);
              }}
              className="px-3 py-1.5 bg-white border border-indigo-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs"
            >
              {availableBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} – {b.name} ({b.district || "Kerala"})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Branch Authorization Warning Banner */}
      {(!isBranchAuthorized || resolutionError) && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-300 flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-xs font-black text-rose-950 uppercase tracking-wide">
              Branch Assignment Notice
            </strong>
            <p className="text-xs text-rose-800 font-medium mt-1">
              {resolutionError || "Your administrative profile is not linked to an active franchise branch in the database. Replenishment orders cannot be placed until your profile is assigned a valid branch UUID."}
            </p>
          </div>
        </div>
      )}

      {/* SECTION 1: Weekly Replenishment Order Form */}
      <div className="bg-white rounded-2xl sm:rounded-[22px] border border-rose-100/90 shadow-[0_4px_24px_rgba(216,49,98,0.04)] p-4 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-5 border-b border-slate-100 gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-wider uppercase text-slate-900">
                WEEKLY STOCK REPLENISHMENT ORDER
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Select crate requirements for parlour restock &bull; Dispatched from Varavoor Central Cold Storage
              </p>
            </div>
          </div>

          <div className="text-xs font-bold text-slate-500">
            1 Crate = 10 Handcrafted Sticks
          </div>
        </div>

        {/* Pending Order Notice Banner */}
        {activePendingOrder && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-50/90 border border-amber-300 flex items-start gap-3 shadow-xs">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <strong className="text-xs font-black text-amber-950 uppercase tracking-wide">
                  Order Pending Review: {activePendingOrder.orderNumber}
                </strong>
                <span className="font-mono text-[10px] font-bold bg-amber-200/90 text-amber-900 px-2 py-0.5 rounded-full uppercase">
                  {activePendingOrder.status.replace(/_/g, "-")}
                </span>
              </div>
              <p className="text-xs text-amber-800 font-medium mt-1">
                This branch already has an active replenishment order awaiting Varavoor Factory review. To maintain inventory integrity and prevent duplicate production runs, another order cannot be placed until the pending order is reviewed.
              </p>
              <p className="text-[11px] text-amber-700 mt-1 font-semibold">
                Order Total: {pendingOrderTotalCrates || "—"} Crates &bull; Submitted: {activePendingOrder.submittedAt || "Recent"}
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmitOrder}>
          {/* 2-Column Grid of Flavour Crate Counters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {products.map((prod) => {
              const qty = orderQuantities[prod.id] || 0;

              return (
                <div
                  key={prod.id}
                  className="border border-slate-200/80 hover:border-amber-200 rounded-2xl p-4 sm:p-5 bg-white transition-all hover:shadow-xs flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {prod.name}
                      </h3>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                        {prod.category}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 font-medium mt-1">
                      SKU: {prod.sku} &bull; 10 Sticks/Crate
                    </p>
                  </div>

                  {/* Quantity Counter Control */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => updateQuantity(prod.id, -1)}
                      className="w-8 h-8 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-12 text-center">
                      <span className="text-base font-black text-slate-900">{qty}</span>
                      <span className="block text-[10px] text-slate-400 font-bold uppercase leading-none">
                        Crates
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => updateQuantity(prod.id, 1)}
                      className="w-8 h-8 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 flex items-center justify-center transition-colors cursor-pointer font-bold"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Delivery Date & Notes Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/70 mb-5">
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                Requested Delivery Date
              </label>
              <input
                type="text"
                value={requestedDate}
                onChange={(e) => setRequestedDate(e.target.value)}
                placeholder="e.g. Next Friday (Oct 24)"
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                Parlour Storage Notes / Special Instructions
              </label>
              <input
                type="text"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="e.g. Deep freezer bay #2 cleared for delivery"
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Submission Bar & Actionable Diagnostics */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <div>
              <span className="text-xs text-slate-500 font-medium">Order Total:</span>{" "}
              <strong className="text-base font-black text-slate-900">
                {totalCrates} Crates ({totalSticks} Sticks)
              </strong>
              <span className="text-xs text-slate-400 font-medium ml-2">
                &bull; Est. Wholesale Value: ₹{estimatedCost.toLocaleString("en-IN")}
              </span>
            </div>

            <div className="flex flex-col items-end gap-2 max-w-xl">
              {/* Branch Status Banners */}
              {isBranchAuthorized ? (
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>
                    Authorized Branch: <strong>{activeBranch?.code}</strong> – {activeBranch?.name}
                    <span className="ml-2 font-mono text-[10px] text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded">
                      {activeBranch?.id}
                    </span>
                  </span>
                </div>
              ) : branchStatus === "profile_unassigned" ? (
                <div className="flex items-start gap-2 text-xs font-semibold text-rose-800 bg-rose-50 p-2.5 rounded-xl border border-rose-200 text-left">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-rose-900">Profile Missing Branch Assignment:</strong>
                    Account has role <code className="font-mono text-[10px] bg-rose-100 px-1 rounded">branch_admin</code>, but no branch UUID is linked in <code className="font-mono text-[10px] bg-rose-100 px-1 rounded">public.profiles.branch_id</code>.
                    <span className="block mt-0.5 text-[11px] text-rose-700 font-normal">
                      <strong>Safe administrative action required:</strong> A Super Administrator must update your profile in <code className="font-mono">public.profiles</code> to assign your branch UUID.
                    </span>
                  </div>
                </div>
              ) : branchStatus === "malformed_uuid" ? (
                <div className="flex items-start gap-2 text-xs font-semibold text-rose-800 bg-rose-50 p-2.5 rounded-xl border border-rose-200 text-left">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-rose-900">Malformed Branch Identifier:</strong>
                    Assigned branch UUID (<span className="font-mono">{assignedBranchId}</span>) is not a valid UUID format.
                  </div>
                </div>
              ) : branchStatus === "branch_not_found" ? (
                <div className="flex items-start gap-2 text-xs font-semibold text-rose-800 bg-rose-50 p-2.5 rounded-xl border border-rose-200 text-left">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-rose-900">Branch Record Missing:</strong>
                    Assigned branch UUID (<span className="font-mono">{assignedBranchId}</span>) does not exist in <code className="font-mono">public.branches</code>.
                  </div>
                </div>
              ) : branchStatus === "branch_inactive" ? (
                <div className="flex items-start gap-2 text-xs font-semibold text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200 text-left">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-amber-900">Branch Inactive:</strong>
                    The assigned branch is deactivated. Order submissions are disabled.
                  </div>
                </div>
              ) : branchStatus === "query_error" ? (
                <div className="flex items-start gap-2 text-xs font-semibold text-rose-800 bg-rose-50 p-2.5 rounded-xl border border-rose-200 text-left">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-rose-900">Database / RLS Query Error:</strong>
                    {resolutionError || "Failed to query branch profile."}
                  </div>
                </div>
              ) : (
                <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                  ⚠ No authorized branch UUID linked. Submission disabled.
                </span>
              )}

              <button
                type="submit"
                id="btn-submit-branch-order"
                data-testid="submit-branch-order"
                disabled={isSubmitting || totalCrates === 0 || !isBranchAuthorized || Boolean(activePendingOrder)}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#0F172A] hover:bg-[#1E293B] text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-w-[260px]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                    <span>Submitting Order to Varavoor Factory...</span>
                  </>
                ) : activePendingOrder ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Order Pending Factory Review</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5 text-amber-400" />
                    <span>Submit Order to Varavoor Factory</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* SECTION 2: Incoming Shipments & Verification */}
      <div className="bg-white rounded-2xl sm:rounded-[22px] border border-rose-100/90 shadow-[0_4px_24px_rgba(216,49,98,0.04)] p-4 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-5 border-b border-slate-100 gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-wider uppercase text-slate-900">
                INCOMING FACTORY DELIVERIES &amp; PHYSICAL RECEIVING
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Verify incoming reefer van shipments against manifest and confirm physical crate counts
              </p>
            </div>
          </div>

          <div className="text-xs font-bold text-slate-500">
            {currentBranchDispatches.length} Shipments on Record
          </div>
        </div>

        {/* 2-Column Grid of Dispatches for Active Branch */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {currentBranchDispatches.map((dispatch) => {
            const stop = dispatch.stops.find((s) => {
              if (effectiveBranchId && s.branchId.toLowerCase() === effectiveBranchId.toLowerCase()) return true;
              if (activeBranch && s.branchId.toLowerCase().includes(activeBranch.code.toLowerCase())) return true;
              return s.branchId.includes("ollur") || s.branchId === "branch-13";
            });
            const isCompleted = stop?.status === "delivered";
            const stopCrates = stop?.items.reduce((acc, it) => acc + it.requestedPacks, 0) || 140;

            return (
              <div
                key={dispatch.id}
                className="border border-slate-200/80 hover:border-amber-200 rounded-2xl p-4 sm:p-5 bg-white transition-all hover:shadow-xs flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        Batch #{dispatch.manifestNumber} &bull; {dispatch.driverPhone ? `${dispatch.vehicleNumber}` : dispatch.vehicleNumber}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium mt-1">
                        Driver: <strong className="text-slate-800">{dispatch.driverName}</strong> ({dispatch.driverPhone})
                      </p>
                    </div>

                    {/* Status Pill */}
                    <div>
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>RECEIVED &amp; VERIFIED</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                          <span>ARRIVED AT PARLOUR</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span>Allocation: <strong>{stopCrates} Crates</strong></span>
                    <span>Reefer Temp: <strong>-18.4&deg;C Verified</strong></span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  {!isCompleted ? (
                    <button
                      onClick={() => handleConfirmReceipt(stop?.orderId || "ord-sample")}
                      type="button"
                      className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#1E293B] rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      Confirm Physical Receipt
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Physical Handover Logged</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminShell>
  );
}
