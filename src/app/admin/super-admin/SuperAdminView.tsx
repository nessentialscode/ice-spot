"use client";

import React, { useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { OrderReviewQueue } from "@/components/admin/OrderReviewQueue";
import { BranchOperationsSection } from "@/components/admin/BranchOperationsSection";
import { AddFlavourModal } from "@/components/admin/AddFlavourModal";
import { useAdmin } from "@/context/AdminContext";
import {
  Boxes,
  Plus,
  Minus
} from "lucide-react";

interface SuperAdminViewProps {
  userEmail?: string;
}

export function SuperAdminView({ userEmail }: SuperAdminViewProps) {
  const {
    products,
    branches,
    toggleBranchOpenStatus,
    setAllBranchesOpenStatus,
    addProduct,
    adjustInventory,
    showToast
  } = useAdmin();

  const [isAddFlavourModalOpen, setIsAddFlavourModalOpen] = useState(false);

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
      subtitle="Varavoor Central Production Headquarters"
      roleBadgeText="SUPER ADMIN"
      roleBadgeColor="rose"
      userEmail={userEmail}
    >
      {/* SECTION 1: Branch Network Operations & Outlet Status (Mark Open/Closed) */}
      <BranchOperationsSection
        branches={branches}
        onToggleBranch={toggleBranchOpenStatus}
        onSetAllBranches={setAllBranchesOpenStatus}
      />

      {/* SECTION 2: Branch Order Replenishment Queue (Authoritative Database Architecture) */}
      <OrderReviewQueue />

      {/* SECTION 3: Factory Handcrafted Flavour Inventory */}
      <div className="bg-white rounded-2xl sm:rounded-[22px] border border-rose-100/90 shadow-[0_4px_24px_rgba(216,49,98,0.04)] p-4 sm:p-7">
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
