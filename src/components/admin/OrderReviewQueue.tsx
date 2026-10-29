"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminOrder } from "@/types/admin";
import { getOrdersAction } from "@/lib/actions/orders";
import { useAdmin } from "@/context/AdminContext";
import { OrderReviewModal } from "./OrderReviewModal";
import {
  Store,
  Search,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Calendar,
  Boxes,
  Eye,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from "lucide-react";

export type QueueTab = "all" | "awaiting" | "approved" | "cancelled" | "correction";

export function OrderReviewQueue() {
  const { syncOrdersFromServer } = useAdmin();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<QueueTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Authoritative server fetch
  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await getOrdersAction();
      if (!res.success) {
        setFetchError(res.message || "Failed to retrieve orders from database.");
        setOrders([]);
      } else {
        setOrders(res.data || []);
      }
    } catch (err: any) {
      setFetchError(
        err?.message || "An unexpected error occurred while contacting the server."
      );
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Tab filtering
  const filteredOrders = orders.filter((order) => {
    const normStatus = order.status.replace(/_/g, "-");

    // 1. Tab check
    let matchesTab = false;
    if (activeTab === "approved") {
      matchesTab =
        normStatus === "approved" ||
        normStatus === "dispatched" ||
        normStatus === "delivered" ||
        normStatus === "ready-for-dispatch" ||
        normStatus === "preparation";
    } else if (activeTab === "awaiting") {
      matchesTab = normStatus === "submitted" || normStatus === "under-review";
    } else if (activeTab === "correction") {
      matchesTab = normStatus === "amendment-requested";
    } else if (activeTab === "cancelled") {
      matchesTab = normStatus === "cancelled";
    } else if (activeTab === "all") {
      matchesTab = true;
    }

    if (!matchesTab) return false;

    // 2. Search check
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchBranch = order.branchName?.toLowerCase().includes(q);
      const matchCode = order.branchCode?.toLowerCase().includes(q);
      const matchOrderNum = order.orderNumber?.toLowerCase().includes(q);
      return matchBranch || matchCode || matchOrderNum;
    }

    return true;
  });

  // Tab Counts for badges
  const approvedCount = orders.filter((o) => {
    const s = o.status.replace(/_/g, "-");
    return (
      s === "approved" ||
      s === "dispatched" ||
      s === "delivered" ||
      s === "ready-for-dispatch" ||
      s === "preparation"
    );
  }).length;
  const awaitingCount = orders.filter((o) => {
    const s = o.status.replace(/_/g, "-");
    return s === "submitted" || s === "under-review";
  }).length;
  const correctionCount = orders.filter((o) => {
    const s = o.status.replace(/_/g, "-");
    return s === "amendment-requested";
  }).length;
  const cancelledCount = orders.filter((o) => {
    const s = o.status.replace(/_/g, "-");
    return s === "cancelled";
  }).length;
  const allCount = orders.length;

  const handleOpenReview = (order: AdminOrder) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedOrder(null);
  };

  return (
    <div className="bg-white rounded-2xl sm:rounded-[22px] border border-rose-100/90 shadow-[0_4px_24px_rgba(216,49,98,0.04)] p-4 sm:p-7">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-5 border-b border-slate-100 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 text-[#E22F62] flex items-center justify-center flex-shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black tracking-wider uppercase text-slate-900">
              BRANCH ORDER REPLENISHMENT QUEUE
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Weekly parlour replenishment orders &bull; Review, approve, and manage branch stock requests
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={loadOrders}
            disabled={isLoading}
            type="button"
            className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold disabled:opacity-50"
            title="Refresh queue from database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
        {/* Filter Tabs in requested order: All Orders, Awaiting Review, Approved Orders, Cancelled, Correction Requested */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 1. All Orders */}
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "all"
                ? "bg-[#0F172A] text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <span>All Orders</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeTab === "all" ? "bg-slate-700 text-white" : "bg-slate-200 text-slate-700"
              }`}
            >
              {allCount}
            </span>
          </button>

          {/* 2. Awaiting Review */}
          <button
            type="button"
            onClick={() => setActiveTab("awaiting")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "awaiting"
                ? "bg-amber-500 text-white shadow-xs"
                : "bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200/80"
            }`}
          >
            <span>Awaiting Review</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeTab === "awaiting" ? "bg-amber-600 text-white" : "bg-amber-200/60 text-amber-950"
              }`}
            >
              {awaitingCount}
            </span>
          </button>

          {/* 3. Approved Orders */}
          <button
            type="button"
            onClick={() => setActiveTab("approved")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "approved"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/80"
            }`}
          >
            <span>Approved Orders</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeTab === "approved" ? "bg-emerald-700 text-white" : "bg-emerald-200/70 text-emerald-950"
              }`}
            >
              {approvedCount}
            </span>
          </button>

          {/* 4. Cancelled */}
          <button
            type="button"
            onClick={() => setActiveTab("cancelled")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "cancelled"
                ? "bg-rose-600 text-white shadow-xs"
                : "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
            }`}
          >
            <span>Cancelled</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeTab === "cancelled" ? "bg-rose-700 text-white" : "bg-rose-200 text-rose-800"
              }`}
            >
              {cancelledCount}
            </span>
          </button>

          {/* 5. Correction Requested */}
          <button
            type="button"
            onClick={() => setActiveTab("correction")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "correction"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-amber-50/70 text-amber-800 hover:bg-amber-100/70 border border-amber-200/60"
            }`}
          >
            <span>Correction Requested</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeTab === "correction" ? "bg-amber-700 text-white" : "bg-amber-200/60 text-amber-950"
              }`}
            >
              {correctionCount}
            </span>
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search branch, code, or order..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 font-medium text-slate-800 transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Main Content Areas */}
      {fetchError ? (
        <div className="p-6 rounded-2xl bg-rose-50/80 border border-rose-200 text-rose-900 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto" />
          <div>
            <h3 className="text-sm font-bold">Failed to load replenishment queue</h3>
            <p className="text-xs text-rose-700 mt-1 max-w-md mx-auto">{fetchError}</p>
          </div>
          <button
            onClick={loadOrders}
            type="button"
            className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            Try Again
          </button>
        </div>
      ) : isLoading ? (
        <div className="py-16 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-2">
          <Loader2 className="w-6 h-6 text-rose-500 animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-700">Loading orders from server...</p>
          <p className="text-[11px] text-slate-400">Verifying live database records</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <Store className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-600">No orders found</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {searchQuery
              ? `No orders matching "${searchQuery}" in this view.`
              : activeTab === "approved"
              ? "No approved replenishment orders found in database."
              : activeTab === "awaiting"
              ? "No replenishment orders currently pending Super Admin review."
              : activeTab === "correction"
              ? "No orders currently awaiting branch correction."
              : activeTab === "cancelled"
              ? "No cancelled orders on record."
              : "No orders found in database."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredOrders.map((order) => {
            const normStatus = order.status.replace(/_/g, "-");
            const totalCrates = order.items.reduce(
              (acc, it) => acc + (it.requestedPacks || 0),
              0
            );
            const isPending =
              normStatus === "submitted" || normStatus === "under-review";

            return (
              <div
                key={order.id}
                className="border border-slate-200/80 hover:border-rose-200 rounded-2xl p-4 sm:p-5 bg-white transition-all hover:shadow-xs flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-slate-900 leading-snug">
                          {order.branchName}
                        </h3>
                        {order.branchCode && (
                          <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                            {order.branchCode}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-medium mt-1">
                        Order #{order.orderNumber} &bull; {totalCrates} Crates (
                        {totalCrates * 10} sticks)
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        🏭 Facility:{" "}
                        <span className="font-semibold text-slate-700">
                          {order.destinationFactory || "Varavoor Central Factory"}
                        </span>
                      </p>
                    </div>

                    {/* Status Pill */}
                    <div className="flex-shrink-0">
                      {isPending && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                          <span>
                            {normStatus === "under-review"
                              ? "UNDER REVIEW"
                              : "PENDING REVIEW"}
                          </span>
                        </span>
                      )}
                      {(normStatus === "approved" ||
                        normStatus === "dispatched" ||
                        normStatus === "delivered" ||
                        normStatus === "ready-for-dispatch" ||
                        normStatus === "preparation") && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>APPROVED</span>
                        </span>
                      )}
                      {normStatus === "amendment-requested" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          <span>CORRECTION REQ</span>
                        </span>
                      )}
                      {normStatus === "cancelled" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          <span>CANCELLED</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 space-y-1">
                    <p className="text-[11px] text-slate-500">
                      Requested:{" "}
                      <span className="font-semibold text-slate-700">
                        {order.requestedDeliveryDate}
                      </span>
                      {order.submittedAt && (
                        <span className="text-slate-400 ml-2">
                          &bull; Submitted: {order.submittedAt}
                        </span>
                      )}
                    </p>
                    {order.branchNotes && (
                      <div className="text-[11px] text-amber-900 bg-amber-50/80 border border-amber-200/80 px-2.5 py-1.5 rounded-lg font-medium mt-1">
                        <span className="font-bold">Instructions:</span> {order.branchNotes}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <span className="font-mono text-[10px] text-slate-400 truncate max-w-[120px]" title={order.id}>
                    UUID: {order.id.slice(0, 8)}...
                  </span>

                  <button
                    onClick={() => handleOpenReview(order)}
                    type="button"
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#1E293B] rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{isPending ? "Review Order" : "View Details"}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reusable Review & Detail Modal */}
      <OrderReviewModal
        order={selectedOrder}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSuccess={async () => {
          await loadOrders();
          try {
            await syncOrdersFromServer();
          } catch {
            // gracefully continue
          }
        }}
      />
    </div>
  );
}
