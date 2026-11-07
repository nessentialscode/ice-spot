"use client";

import React, { useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { OrderReviewQueue } from "@/components/admin/OrderReviewQueue";
import { BranchOperationsSection } from "@/components/admin/BranchOperationsSection";
import { AddFlavourModal } from "@/components/admin/AddFlavourModal";
import { PrintablePackingSlip } from "@/components/admin/PrintablePackingSlip";
import { OrderDetailModal } from "@/components/admin/OrderDetailModal";
import { useAdmin } from "@/context/AdminContext";
import { AdminOrder, DispatchBatch } from "@/types/admin";
import {
  Boxes,
  Plus,
  Minus,
  Store,
  ClipboardList,
  Truck,
  Printer,
  LayoutDashboard,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";

interface SuperAdminViewProps {
  userEmail?: string;
}

export function SuperAdminView({ userEmail }: SuperAdminViewProps) {
  const {
    orders,
    products,
    branches,
    dispatches,
    fleetVehicles,
    toggleBranchOpenStatus,
    setAllBranchesOpenStatus,
    addProduct,
    adjustInventory,
    showToast
  } = useAdmin();

  // Super Admin Default Section is "DASHBOARD"
  const [activeSection, setActiveSection] = useState<string>("DASHBOARD");

  const [isAddFlavourModalOpen, setIsAddFlavourModalOpen] = useState(false);
  const [selectedDispatchForPrint, setSelectedDispatchForPrint] = useState<DispatchBatch | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);

  const handleStockIncrement = (productId: string, productName: string) => {
    adjustInventory(productId, 100, "Production Output");
    showToast(`Added +10 crates (+100 sticks) to ${productName}`, "success");
  };

  const handleStockDecrement = (productId: string, productName: string) => {
    adjustInventory(productId, -100, "Manual Correction");
    showToast(`Deducted 10 crates (100 sticks) from ${productName}`, "info");
  };

  // Metrics for Dashboard
  const openBranchesCount = branches.filter((b) => b.isOpen).length;
  const pendingOrdersCount = orders.filter(
    (o) => o.status === "submitted" || o.status === "under-review"
  ).length;
  const approvedOrdersCount = orders.filter(
    (o) => o.status === "approved" || o.status === "dispatched" || o.status === "ready-for-dispatch"
  ).length;
  const totalStockSticks = products.reduce((acc, p) => acc + (p.currentStock || 0), 0);
  const totalStockCrates = Math.floor(totalStockSticks / 10);
  const lowStockCount = products.filter((p) => p.currentStock <= p.minStockAlert).length;
  const activeDispatchesCount = dispatches.filter(
    (d) => d.status === "in-transit" || d.status === "loading"
  ).length;

  return (
    <AdminShell
      title="Youback Icespot Factory"
      subtitle="Varavoor Central Production Headquarters"
      roleBadgeText="SUPER ADMIN"
      roleBadgeColor="rose"
      userEmail={userEmail}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
    >
      {/* 1. DASHBOARD SECTION (Default Section) */}
      {activeSection === "DASHBOARD" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Executive KPI Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Branch Network */}
            <div
              onClick={() => setActiveSection("BRANCH NETWORK")}
              className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs hover:border-[#BD1F49]/40 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                    Branch Network
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 text-[#BD1F49] flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Store className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {openBranchesCount} <span className="text-base text-slate-400 font-bold">/ {branches.length}</span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Active parlour outlets open in Kerala
                </p>
              </div>
              <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-[#BD1F49]">
                <span>Manage Outlets</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Card 2: Branch Orders */}
            <div
              onClick={() => setActiveSection("BRANCH ORDERS")}
              className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                    Branch Orders
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <ClipboardList className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-baseline gap-2">
                  <span>{pendingOrdersCount}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                    Awaiting
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  {approvedOrdersCount} orders approved &amp; in transit
                </p>
              </div>
              <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-amber-800">
                <span>Review Replenishment Queue</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Card 3: Factory Inventory */}
            <div
              onClick={() => setActiveSection("FACTORY INVENTORY")}
              className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs hover:border-rose-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                    Factory Inventory
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 text-[#BD1F49] flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Boxes className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-baseline gap-2">
                  <span>{totalStockCrates}</span>
                  <span className="text-xs font-bold text-slate-500">Crates</span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  {totalStockSticks} sticks in Varavoor cold storage
                </p>
              </div>
              <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-[#BD1F49]">
                <span>{lowStockCount > 0 ? `${lowStockCount} Low SKUs Alert` : "Inspect Flavour Stock"}</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Card 4: Vehicle Status */}
            <div
              onClick={() => setActiveSection("VEHICLE STATUS")}
              className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs hover:border-sky-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                    Vehicle Status
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100 text-sky-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Truck className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-baseline gap-2">
                  <span>{dispatches.length}</span>
                  <span className="text-xs font-bold text-slate-500">Batches</span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  {activeDispatchesCount} reefer vans in transit / loading
                </p>
              </div>
              <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-sky-800">
                <span>View Reefer Logistics Fleet</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </div>

          {/* Core Operations Desk in Dashboard */}
          <BranchOperationsSection
            branches={branches}
            onToggleBranch={toggleBranchOpenStatus}
            onSetAllBranches={setAllBranchesOpenStatus}
          />

          <OrderReviewQueue />
        </div>
      )}

      {/* 2. BRANCH NETWORK SECTION */}
      {activeSection === "BRANCH NETWORK" && (
        <div className="animate-in fade-in duration-200">
          <BranchOperationsSection
            branches={branches}
            onToggleBranch={toggleBranchOpenStatus}
            onSetAllBranches={setAllBranchesOpenStatus}
          />
        </div>
      )}

      {/* 3. BRANCH ORDERS SECTION */}
      {activeSection === "BRANCH ORDERS" && (
        <div className="animate-in fade-in duration-200">
          <OrderReviewQueue />
        </div>
      )}

      {/* 4. FACTORY INVENTORY SECTION */}
      {activeSection === "FACTORY INVENTORY" && (
        <div className="bg-white rounded-2xl sm:rounded-[22px] border border-slate-200/90 shadow-xs p-4 sm:p-7 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-5 border-b border-slate-100 gap-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 text-[#BD1F49] flex items-center justify-center flex-shrink-0">
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
                className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-[#D83162] to-[#B51B47] hover:from-[#B51B47] hover:to-[#6D0C27] text-white shadow-xs hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer"
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
      )}

      {/* 5. VEHICLE STATUS SECTION */}
      {activeSection === "VEHICLE STATUS" && (
        <div className="bg-white rounded-2xl sm:rounded-[22px] border border-slate-200/90 shadow-xs p-4 sm:p-7 animate-in fade-in duration-200 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-100 gap-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100 text-sky-700 flex items-center justify-center flex-shrink-0">
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
              {dispatches.length} Vehicle Batches on Record &bull; {fleetVehicles.length} Registered Fleet Vans
            </div>
          </div>

          {/* 2-Column Grid of Dispatches */}
          {dispatches.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <Truck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-600">No vehicle dispatch trips scheduled</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Dispatch batches configured by logistics staff will appear here with live transit status.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dispatches.map((dispatch) => {
                const stopsText = dispatch.stops.map((s) => s.branchName.replace(" Branch", "")).join(", ");
                const crateCount = Math.floor(dispatch.totalUnits / 10);

                return (
                  <div
                    key={dispatch.id}
                    className="border border-slate-200/80 hover:border-sky-200 rounded-2xl p-4 sm:p-5 bg-white transition-all hover:shadow-xs flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 leading-snug">
                            {dispatch.vehicleNumber} &bull; {dispatch.driverName}
                          </h3>
                          <p className="text-xs text-slate-500 font-medium mt-1">
                            Route: <strong className="text-slate-800">{stopsText || "Varavoor Factory Route"}</strong>
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
                          {dispatch.status === "scheduled" && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                              <span>SCHEDULED</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex-wrap gap-2">
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
                        className="px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Printer className="w-3.5 h-3.5 text-[#BD1F49]" />
                        <span>Print Packing Manifest</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Flavour Modal */}
      <AddFlavourModal
        isOpen={isAddFlavourModalOpen}
        onClose={() => setIsAddFlavourModalOpen(false)}
        onAddProduct={addProduct}
        existingCount={products.length}
      />

      {/* Printable Slip Modal */}
      {selectedDispatchForPrint && (
        <PrintablePackingSlip
          dispatch={selectedDispatchForPrint}
          onClose={() => setSelectedDispatchForPrint(null)}
        />
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </AdminShell>
  );
}
