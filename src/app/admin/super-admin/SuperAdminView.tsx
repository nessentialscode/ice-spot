"use client";

import React, { useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { OrderDetailModal } from "@/components/admin/OrderDetailModal";
import { PrintablePackingSlip } from "@/components/admin/PrintablePackingSlip";
import { BranchOperationsSection } from "@/components/admin/BranchOperationsSection";
import { AddFlavourModal } from "@/components/admin/AddFlavourModal";
import { useAdmin } from "@/context/AdminContext";
import { AdminOrder, DispatchBatch } from "@/types/admin";
import {
  Store,
  Boxes,
  Truck,
  Printer,
  Plus,
  Minus
} from "lucide-react";

interface SuperAdminViewProps {
  userEmail?: string;
}

export function SuperAdminView({ userEmail }: SuperAdminViewProps) {
  const {
    orders,
    products,
    dispatches,
    branches,
    toggleBranchOpenStatus,
    setAllBranchesOpenStatus,
    addProduct,
    adjustInventory,
    approveOrder,
    showToast
  } = useAdmin();

  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [selectedDispatchForPrint, setSelectedDispatchForPrint] = useState<DispatchBatch | null>(null);
  const [isAddFlavourModalOpen, setIsAddFlavourModalOpen] = useState(false);

  const handleQuickApprove = (order: AdminOrder) => {
    const packsMap: Record<string, number> = {};
    order.items.forEach((it) => {
      packsMap[it.productId] = it.requestedPacks;
    });
    approveOrder(order.id, packsMap, "Approved by Varavoor Factory Operations Manager");
    showToast(`Order ${order.orderNumber} for ${order.branchName} approved successfully`, "success");
  };

  const handleStockIncrement = (productId: string, productName: string) => {
    adjustInventory(productId, 100, "Production Output");
    showToast(`Added +10 crates (+100 sticks) to ${productName}`, "success");
  };

  const handleStockDecrement = (productId: string, productName: string) => {
    adjustInventory(productId, -100, "Manual Correction");
    showToast(`Deducted 10 crates (100 sticks) from ${productName}`, "info");
  };

  return (
    <AdminShell
      title="Youback Icespot Factory"
      subtitle="Varavoor Central Production & Logistics Headquarters"
      roleBadgeText="SUPER ADMIN"
      roleBadgeColor="rose"
      userEmail={userEmail || "admin@icespot.com"}
    >
      {/* SECTION 1: Branch Network Operations & Outlet Status (Mark Open/Closed) */}
      <BranchOperationsSection
        branches={branches}
        onToggleBranch={toggleBranchOpenStatus}
        onSetAllBranches={setAllBranchesOpenStatus}
      />

      {/* SECTION 2: Branch Order Replenishment Queue */}
      <div className="bg-white rounded-[22px] border border-rose-100/90 shadow-[0_4px_24px_rgba(216,49,98,0.04)] p-6 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-5 border-b border-slate-100 gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 text-[#E22F62] flex items-center justify-center flex-shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-wider uppercase text-slate-900">
                BRANCH ORDER REPLENISHMENT QUEUE
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Weekly parlour orders awaiting Varavoor factory review, stock allocation, and dispatch
              </p>
            </div>
          </div>

          <div className="text-xs font-bold text-slate-500">
            {orders.filter((o) => o.status === "submitted").length} Orders Awaiting Review
          </div>
        </div>

        {/* 2-Column Grid of Branch Orders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {orders.slice(0, 6).map((order) => {
            const totalCrates = order.items.reduce((acc, it) => acc + it.requestedPacks, 0);
            const isPending = order.status === "submitted";
            const isApproved = order.status === "approved";
            const isDispatched = order.status === "dispatched";

            return (
              <div
                key={order.id}
                className="border border-slate-200/80 hover:border-rose-200 rounded-2xl p-4 sm:p-5 bg-white transition-all hover:shadow-xs flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {order.branchName}
                      </h3>
                      <p className="text-xs text-slate-400 font-medium mt-1">
                        Order #{order.orderNumber} &bull; {totalCrates} Crates ({order.totalUnitsRequested} sticks)
                      </p>
                    </div>

                    {/* Status Pill */}
                    <div>
                      {isPending && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                          <span>PENDING REVIEW</span>
                        </span>
                      )}
                      {isApproved && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>APPROVED</span>
                        </span>
                      )}
                      {isDispatched && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                          <span>IN TRANSIT</span>
                        </span>
                      )}
                      {order.status === "delivered" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                          <span>DELIVERED</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 mt-2">
                    Delivery req: <span className="font-semibold text-slate-700">{order.requestedDeliveryDate}</span>
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => setSelectedOrder(order)}
                    type="button"
                    className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all cursor-pointer"
                  >
                    View Details
                  </button>

                  {isPending && (
                    <button
                      onClick={() => handleQuickApprove(order)}
                      type="button"
                      className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#1E293B] rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      Approve Order
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 3: Factory Handcrafted Flavour Inventory */}
      <div className="bg-white rounded-[22px] border border-rose-100/90 shadow-[0_4px_24px_rgba(216,49,98,0.04)] p-6 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-5 border-b border-slate-100 gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 text-[#E22F62] flex items-center justify-center flex-shrink-0">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-wider uppercase text-slate-900">
                FACTORY HANDCRAFTED FLAVOUR INVENTORY
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Varavoor central cold storage reserve stocks for signature handcrafted flavours (1 Crate = 10 Sticks)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs font-bold text-slate-500 hidden sm:block">
              {products.length} Flavour SKUs Monitored
            </div>

            <button
              onClick={() => setIsAddFlavourModalOpen(true)}
              type="button"
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-[#D83162] to-[#B51B47] hover:from-[#B51B47] hover:to-[#6D0C27] text-white shadow-xs shadow-rose-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer"
              title="Add a new flavour SKU to factory inventory"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add Flavour</span>
            </button>
          </div>
        </div>

        {/* 2-Column Grid of 10 Flavour Inventories */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {products.map((prod) => {
            const isLow = prod.currentStock <= prod.minStockAlert;
            const crateCount = Math.floor(prod.currentStock / 10);

            return (
              <div
                key={prod.id}
                className="border border-slate-200/80 hover:border-rose-200 rounded-2xl p-4 sm:p-5 bg-white transition-all hover:shadow-xs flex items-center justify-between gap-4"
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
                    Stock: <strong className="text-slate-900">{crateCount} Crates</strong> ({prod.currentStock} sticks) &bull; SKU: {prod.sku}
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {/* Status Pill */}
                  {isLow ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                      <span>LOW STOCK</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span>OPTIMAL</span>
                    </span>
                  )}

                  {/* Stock Quick Adjustment Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleStockDecrement(prod.id, prod.name)}
                      type="button"
                      title="Deduct 10 Crates (100 Sticks)"
                      className="w-8 h-8 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleStockIncrement(prod.id, prod.name)}
                      type="button"
                      title="Add +10 Crates (+100 Sticks)"
                      className="w-8 h-8 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-[#BD1F49] flex items-center justify-center transition-colors cursor-pointer font-bold"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 4: Active Reefer Van Logistics Dispatches */}
      <div className="bg-white rounded-[22px] border border-rose-100/90 shadow-[0_4px_24px_rgba(216,49,98,0.04)] p-6 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-5 border-b border-slate-100 gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 text-[#E22F62] flex items-center justify-center flex-shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-wider uppercase text-slate-900">
                ACTIVE REEFER VAN FLEET &amp; LOGISTICS DISPATCH
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Cold-chain transportation routes departing Varavoor for regional parlours (-18°C verified)
              </p>
            </div>
          </div>

          <div className="text-xs font-bold text-slate-500">
            {dispatches.length} Vehicle Batches Scheduled
          </div>
        </div>

        {/* 2-Column Grid of Dispatches */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dispatches.map((dispatch) => {
            const stopsText = dispatch.stops.map((s) => s.branchName.replace(" Branch", "")).join(", ");
            const crateCount = Math.floor(dispatch.totalUnits / 10);

            return (
              <div
                key={dispatch.id}
                className="border border-slate-200/80 hover:border-rose-200 rounded-2xl p-4 sm:p-5 bg-white transition-all hover:shadow-xs flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {dispatch.vehicleNumber} &bull; {dispatch.driverName}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium mt-1">
                        Route: <strong className="text-slate-800">{stopsText}</strong>
                      </p>
                    </div>

                    {/* Status Pill */}
                    <div>
                      {dispatch.status === "in-transit" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></span>
                          <span>IN TRANSIT (-18.4&deg;C)</span>
                        </span>
                      )}
                      {dispatch.status === "loading" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          <span>AT LOADING BAY</span>
                        </span>
                      )}
                      {dispatch.status === "completed" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>TRIP COMPLETED</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span>Manifest: <strong>#{dispatch.manifestNumber}</strong></span>
                    <span>Cargo: <strong>{crateCount} Crates</strong> ({dispatch.totalUnits} sticks)</span>
                    <span>Date: <strong>{dispatch.dispatchDate}</strong></span>
                  </div>
                </div>

                {/* Action */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => setSelectedDispatchForPrint(dispatch)}
                    type="button"
                    className="px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#E22F62]" />
                    <span>Print Packing Manifest</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {/* Printable Slip Modal */}
      {selectedDispatchForPrint && (
        <PrintablePackingSlip
          dispatch={selectedDispatchForPrint}
          onClose={() => setSelectedDispatchForPrint(null)}
        />
      )}

      {/* Add Flavour Modal */}
      <AddFlavourModal
        isOpen={isAddFlavourModalOpen}
        onClose={() => setIsAddFlavourModalOpen(false)}
        onAddProduct={addProduct}
        existingCount={products.length}
      />
    </AdminShell>
  );
}
