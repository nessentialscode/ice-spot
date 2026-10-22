"use client";

import React, { useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdmin } from "@/context/AdminContext";
import { OrderItem } from "@/types/admin";
import {
  Store,
  Truck,
  Plus,
  Minus,
  CheckCircle2,
  Send
} from "lucide-react";

interface BranchAdminViewProps {
  userEmail?: string;
}

export function BranchAdminView({ userEmail }: BranchAdminViewProps) {
  const {
    products,
    dispatches,
    submitOrder,
    receiveShipment,
    showToast
  } = useAdmin();

  // Ollur Branch ID is "branch-13" or "ollur-branch"
  const ollurDispatches = dispatches.filter((d) =>
    d.stops.some((s) => s.branchId.includes("ollur") || s.branchId === "branch-13")
  );

  // Weekly Order Quantities state (crate counts for each of the 10 flavours)
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

  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (totalCrates === 0) {
      showToast("Please add at least 1 crate to submit an order", "error");
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

    submitOrder({
      branchId: "branch-13",
      items,
      notes: orderNotes,
      requestedDeliveryDate: requestedDate
    });

    showToast("Weekly replenishment order submitted to Varavoor Factory", "success");
    setIsSubmitting(false);
  };

  const handleConfirmReceipt = (orderId: string) => {
    receiveShipment(orderId, {}, {}, {}, "All crates received frozen at -18°C in perfect factory condition");
    showToast("Shipment verified and received successfully at Ollur parlour", "success");
  };

  return (
    <AdminShell
      title="Youback Icespot Factory"
      subtitle="Franchise Parlour #13 &bull; Ollur, Thrissur"
      roleBadgeText="BRANCH ADMIN"
      roleBadgeColor="amber"
      userEmail={userEmail || "ollur@icespot.com"}
    >
      {/* SECTION 1: Weekly Replenishment Order Form */}
      <div className="bg-white rounded-[22px] border border-rose-100/90 shadow-[0_4px_24px_rgba(216,49,98,0.04)] p-6 sm:p-7">
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
                Select crate requirements for your parlour restock &bull; Dispatched from Varavoor Central Cold Storage
              </p>
            </div>
          </div>

          <div className="text-xs font-bold text-slate-500">
            1 Crate = 10 Handcrafted Sticks
          </div>
        </div>

        <form onSubmit={handleSubmitOrder}>
          {/* 2-Column Grid of 10 Flavour Crate Counters */}
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

          {/* Submission Bar */}
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

            <button
              type="submit"
              disabled={isSubmitting || totalCrates === 0}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#0F172A] hover:bg-[#1E293B] text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5 text-amber-400" />
              <span>Submit Order to Varavoor Factory</span>
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 2: Incoming Shipments & Verification */}
      <div className="bg-white rounded-[22px] border border-rose-100/90 shadow-[0_4px_24px_rgba(216,49,98,0.04)] p-6 sm:p-7">
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
            {ollurDispatches.length} Shipments on Record
          </div>
        </div>

        {/* 2-Column Grid of Dispatches for Ollur */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ollurDispatches.map((dispatch) => {
            const stop = dispatch.stops.find((s) => s.branchId.includes("ollur") || s.branchId === "branch-13");
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
                        Batch #{dispatch.manifestNumber} &bull; {dispatch.vehicleNumber}
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
                    <span>Ollur Allocation: <strong>{stopCrates} Crates</strong></span>
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
