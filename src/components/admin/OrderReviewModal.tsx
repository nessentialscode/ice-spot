"use client";

import React, { useState, useEffect } from "react";
import { AdminOrder } from "@/types/admin";
import {
  approveOrderAction,
  rejectOrderAction,
  returnOrderForCorrectionAction,
} from "@/lib/actions/orders";
import { getInvoiceForOrderAction } from "@/lib/actions/invoices";
import { INITIAL_ADMIN_INVOICES } from "@/lib/data/adminMockData";
import { InvoiceModal } from "./InvoiceModal";
import {
  X,
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertTriangle,
  Boxes,
  Loader2,
  Store,
  Calendar,
  FileText,
  Clock,
} from "lucide-react";

interface OrderReviewModalProps {
  order: AdminOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

type ActionMode = "view" | "approve" | "return" | "reject";

export function OrderReviewModal({
  order,
  isOpen,
  onClose,
  onSuccess,
}: OrderReviewModalProps) {
  const [actionMode, setActionMode] = useState<ActionMode>("view");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states
  const [rejectReason, setRejectReason] = useState("");
  const [correctionFeedback, setCorrectionFeedback] = useState("");
  const [factoryNote, setFactoryNote] = useState("");
  const [approvedPacksMap, setApprovedPacksMap] = useState<Record<string, number>>({});

  // Invoice viewer states
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [isInvoiceLoading, setIsInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  // Reset local state whenever modal opens or active order changes
  useEffect(() => {
    if (order && isOpen) {
      setActionMode("view");
      setIsSubmitting(false);
      setErrorMessage(null);
      setInvoiceError(null);
      setIsInvoiceModalOpen(false);
      setInvoiceData(null);
      setRejectReason("");
      setCorrectionFeedback("");
      setFactoryNote(order.factoryNotes || "");

      const initialMap: Record<string, number> = {};
      const isAlreadyApproved =
        order.status === "approved" ||
        order.status === "preparation" ||
        order.status === "ready-for-dispatch" ||
        order.status === "dispatched";
      order.items.forEach((it) => {
        initialMap[it.productId] =
          isAlreadyApproved && it.approvedPacks !== undefined && it.approvedPacks !== null
            ? it.approvedPacks
            : (it.approvedPacks && it.approvedPacks > 0 ? it.approvedPacks : it.requestedPacks);
      });
      setApprovedPacksMap(initialMap);
    }
  }, [order, isOpen]);

  if (!isOpen || !order) return null;

  const normalizedStatus = order.status.replace(/_/g, "-");
  const isPendingReview =
    normalizedStatus === "submitted" || normalizedStatus === "under-review";
  const isApproved = normalizedStatus === "approved";
  const isCorrectionReq = normalizedStatus === "amendment-requested";
  const isTerminalOrLocked =
    normalizedStatus === "cancelled" ||
    normalizedStatus === "delivered" ||
    normalizedStatus === "dispatched";

  const isInvoiceEligible =
    isApproved ||
    normalizedStatus === "dispatched" ||
    normalizedStatus === "delivered" ||
    normalizedStatus === "ready-for-dispatch" ||
    normalizedStatus === "preparation" ||
    normalizedStatus === "partially-delivered";

  const handleOpenInvoice = async () => {
    setIsInvoiceLoading(true);
    setInvoiceError(null);
    try {
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (UUID_REGEX.test(order.id)) {
        const res = await getInvoiceForOrderAction(order.id);
        if (res.success && res.data) {
          setInvoiceData(res.data);
          setIsInvoiceModalOpen(true);
          return;
        }
      }

      // Fallback for prototype / seeded demo orders
      const fallbackInv = INITIAL_ADMIN_INVOICES.find(
        (inv) => inv.orderId === order.id || inv.orderNumber === order.orderNumber
      );
      if (fallbackInv) {
        setInvoiceData(fallbackInv);
        setIsInvoiceModalOpen(true);
      } else {
        setInvoiceError("Commercial invoice not available for this order.");
      }
    } catch (err: any) {
      setInvoiceError(err.message || "Failed to retrieve invoice.");
    } finally {
      setIsInvoiceLoading(false);
    }
  };

  // Actions available based on order lifecycle
  const canReject = !isTerminalOrLocked;
  const canReturnForCorrection = isPendingReview || isApproved;
  const canApprove = isPendingReview || isCorrectionReq;

  // Calculate totals
  const totalRequestedCrates = order.items.reduce(
    (sum, it) => sum + (it.requestedPacks || 0),
    0
  );
  const totalApprovedCrates = order.items.reduce((sum, it) => {
    const val = approvedPacksMap[it.productId];
    return sum + (val !== undefined ? val : it.requestedPacks || 0);
  }, 0);

  const handleApproveSubmit = async () => {
    if (isSubmitting) return;
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const allocations = Object.entries(approvedPacksMap).map(([pId, qty]) => ({
        productId: pId,
        approvedQuantity: Math.max(0, Number(qty) || 0),
      }));

      const res = await approveOrderAction(
        order.id,
        allocations,
        factoryNote.trim() || undefined
      );

      if (!res.success) {
        setErrorMessage(
          res.message || "Failed to approve order on the server. Please try again."
        );
        setIsSubmitting(false);
        return;
      }

      onClose();
      try {
        await onSuccess();
      } catch (refreshErr) {
        console.warn("[OrderReviewModal] Background refresh warning:", refreshErr);
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message || "An unexpected error occurred during order approval."
      );
      setIsSubmitting(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (isSubmitting) return;
    const trimmed = rejectReason.trim();
    if (!trimmed) {
      setErrorMessage("Please enter a mandatory rejection reason.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await rejectOrderAction(order.id, trimmed);

      if (!res.success) {
        setErrorMessage(
          res.message || "Failed to reject order on server. Please try again."
        );
        setIsSubmitting(false);
        return;
      }

      onClose();
      try {
        await onSuccess();
      } catch (refreshErr) {
        console.warn("[OrderReviewModal] Background refresh warning:", refreshErr);
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message || "An unexpected network or server error occurred."
      );
      setIsSubmitting(false);
    }
  };

  const handleReturnSubmit = async () => {
    if (isSubmitting) return;
    const trimmed = correctionFeedback.trim();
    if (!trimmed) {
      setErrorMessage("Please enter the specific adjustments needed by the branch.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await returnOrderForCorrectionAction(order.id, trimmed);

      if (!res.success) {
        setErrorMessage(
          res.message || "Failed to return order for correction. Please try again."
        );
        setIsSubmitting(false);
        return;
      }

      onClose();
      try {
        await onSuccess();
      } catch (refreshErr) {
        console.warn("[OrderReviewModal] Background refresh warning:", refreshErr);
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message || "An unexpected network or server error occurred."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-2xl sm:rounded-[22px] border border-slate-200/80 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-review-modal-title"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-4 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold bg-slate-900 text-white px-2 py-0.5 rounded-md">
                {order.orderNumber}
              </span>
              <h2
                id="order-review-modal-title"
                className="text-base sm:text-lg font-black text-slate-900"
              >
                {order.branchName}
              </h2>
              {order.branchCode && (
                <span className="text-[11px] font-bold font-mono bg-slate-200/80 text-slate-700 px-1.5 py-0.5 rounded">
                  {order.branchCode}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-1.5">
              <span>District: {order.district || "Thrissur"}</span>
              <span>&bull;</span>
              <span>Facility: {order.destinationFactory || "Varavoor Central Factory"}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Status Pill */}
            {isPendingReview && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                <span>AWAITING REVIEW</span>
              </span>
            )}
            {(normalizedStatus === "approved" ||
              normalizedStatus === "dispatched" ||
              normalizedStatus === "delivered" ||
              normalizedStatus === "ready-for-dispatch" ||
              normalizedStatus === "preparation") && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>APPROVED</span>
              </span>
            )}
            {normalizedStatus === "amendment-requested" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span>CORRECTION REQUESTED</span>
              </span>
            )}
            {normalizedStatus === "cancelled" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                <span>CANCELLED</span>
              </span>
            )}

            {isInvoiceEligible && (
              <button
                type="button"
                onClick={handleOpenInvoice}
                disabled={isInvoiceLoading}
                className="px-2.5 py-1 rounded-xl text-xs font-bold text-[#D83162] hover:bg-rose-50 border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="View Commercial Invoice"
              >
                {isInvoiceLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">Invoice</span>
              </button>
            )}

            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40 cursor-pointer"
              title="Close dialog"
              type="button"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Action Error Alert */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold">Order Mutation Failed</p>
                <p className="mt-0.5 text-rose-700">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Invoice Error Alert */}
          {invoiceError && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold">Invoice Retrieval Issue</p>
                <p className="mt-0.5 text-amber-700">{invoiceError}</p>
              </div>
            </div>
          )}

          {/* Metadata Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider">
                Submitted
              </span>
              <span className="font-bold text-slate-800 mt-0.5 block truncate">
                {order.submittedAt || "Recent"}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider">
                Requested Date
              </span>
              <span className="font-bold text-slate-800 mt-0.5 block truncate">
                {order.requestedDeliveryDate || "Next Run"}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 col-span-2 sm:col-span-1">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider">
                Authoritative UUID
              </span>
              <span
                className="font-mono font-bold text-slate-700 mt-0.5 block truncate text-[11px]"
                title={order.id}
              >
                {order.id}
              </span>
            </div>
          </div>

          {/* Branch Instructions */}
          {order.branchNotes && (
            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/70 text-xs">
              <span className="font-bold text-amber-900 block flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                Branch Instructions
              </span>
              <p className="text-amber-800 mt-1 leading-relaxed">{order.branchNotes}</p>
            </div>
          )}

          {/* Factory Notes if present */}
          {order.factoryNotes && (
            <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs">
              <span className="font-bold text-slate-800 block">Factory Review Notes</span>
              <p className="text-slate-600 mt-1">{order.factoryNotes}</p>
            </div>
          )}

          {/* Order Items Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Order Items ({order.items.length} Product Lines)
              </h3>
              <span className="text-xs font-bold text-slate-700">
                Total: {totalRequestedCrates} Crates ({totalRequestedCrates * 10} Sticks)
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Flavour SKU</th>
                    <th className="py-2.5 px-3 text-right">Requested</th>
                    {actionMode === "approve" && (
                      <th className="py-2.5 px-3 text-right w-28">Approve Crates</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.items.map((it) => {
                    const currentApproved =
                      approvedPacksMap[it.productId] ?? it.requestedPacks;
                    return (
                      <tr key={it.productId} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-3">
                          <p className="font-bold text-slate-900">{it.productName}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {it.sku} &bull; Box of 10 Sticks
                          </p>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                          <span className="font-bold text-slate-900">{it.requestedPacks}</span>{" "}
                          crates
                          <span className="block text-[10px] text-slate-400">
                            {it.requestedPacks * 10} sticks
                          </span>
                        </td>
                        {actionMode === "approve" && (
                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              value={currentApproved}
                              onChange={(e) => {
                                const parsed = parseInt(e.target.value, 10);
                                setApprovedPacksMap((prev) => ({
                                  ...prev,
                                  [it.productId]: isNaN(parsed) ? 0 : Math.max(0, parsed),
                                }));
                              }}
                              disabled={isSubmitting}
                              className="w-20 px-2 py-1 text-right text-xs font-bold border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 bg-white"
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action-Specific Form Panes */}
          {actionMode === "approve" && (
            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200/80 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                  Confirm Order Approval
                </h4>
              </div>
              <p className="text-xs text-emerald-800">
                Approving this order will allocate <strong>{totalApprovedCrates} crates</strong>{" "}
                ({totalApprovedCrates * 10} sticks) from Varavoor factory stock and confirm order approval.
              </p>
              <div>
                <label className="block text-[11px] font-bold text-emerald-900 mb-1">
                  Optional Factory Instructions / Notes
                </label>
                <input
                  type="text"
                  value={factoryNote}
                  onChange={(e) => setFactoryNote(e.target.value)}
                  placeholder="e.g. Approved in full for Tuesday replenishment cycle"
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 text-xs border border-emerald-200 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {actionMode === "return" && (
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  Return Order for Correction
                </h4>
              </div>
              <p className="text-xs text-amber-800">
                The branch will be instructed to adjust and re-submit this order before stock
                allocation can proceed.
              </p>
              <div>
                <label className="block text-[11px] font-bold text-amber-900 mb-1">
                  Correction Feedback <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={correctionFeedback}
                  onChange={(e) => setCorrectionFeedback(e.target.value)}
                  placeholder="Specify why correction is needed (e.g. Malabar Mango crate quota exceeded; please reduce by 5 crates)..."
                  disabled={isSubmitting}
                  className="w-full p-2.5 text-xs border border-amber-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {actionMode === "reject" && (
            <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200/80 space-y-3">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-900">
                  Reject Order
                </h4>
              </div>
              <p className="text-xs text-rose-800">
                This will mark the order as <strong>cancelled</strong> in the database and notify
                the branch. A mandatory rejection reason is required for audit logs.
              </p>
              <div>
                <label className="block text-[11px] font-bold text-rose-900 mb-1">
                  Rejection Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why this order is rejected (e.g. Branch closed for renovation; out of raw milk base)..."
                  disabled={isSubmitting}
                  className="w-full p-2.5 text-xs border border-rose-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
          {actionMode === "view" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>

              {!isTerminalOrLocked && (
                <div className="flex items-center gap-2 flex-wrap">
                  {canReject && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage(null);
                        setActionMode("reject");
                      }}
                      disabled={isSubmitting}
                      className="px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all cursor-pointer"
                    >
                      Reject Order
                    </button>
                  )}

                  {canReturnForCorrection && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage(null);
                        setActionMode("return");
                      }}
                      disabled={isSubmitting}
                      className="px-3.5 py-2 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all cursor-pointer"
                    >
                      Return for Correction
                    </button>
                  )}

                  {canApprove && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage(null);
                        setActionMode("approve");
                      }}
                      disabled={isSubmitting}
                      className="px-4 py-2 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#1E293B] rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      Approve Order
                    </button>
                  )}
                </div>
              )}

              {isTerminalOrLocked && (
                <div className="flex items-center gap-2">
                  {isInvoiceEligible && (
                    <button
                      type="button"
                      onClick={handleOpenInvoice}
                      disabled={isInvoiceLoading}
                      className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="View Commercial Invoice"
                    >
                      {isInvoiceLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D83162]" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-[#D83162]" />
                      )}
                      <span>View Commercial Invoice</span>
                    </button>
                  )}
                  <p className="text-xs text-slate-400 font-medium">
                    Order status ({normalizedStatus}) is locked. No review actions available.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setActionMode("view");
                }}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl transition-all cursor-pointer"
              >
                &larr; Back
              </button>

              {actionMode === "approve" && (
                <button
                  type="button"
                  onClick={handleApproveSubmit}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Approving Order...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm & Approve Order</span>
                    </>
                  )}
                </button>
              )}

              {actionMode === "return" && (
                <button
                  type="button"
                  onClick={handleReturnSubmit}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending to Branch...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>Send Correction Request</span>
                    </>
                  )}
                </button>
              )}

              {actionMode === "reject" && (
                <button
                  type="button"
                  onClick={handleRejectSubmit}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Rejecting Order...</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4" />
                      <span>Confirm Order Rejection</span>
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Commercial Invoice Viewer */}
      {isInvoiceModalOpen && invoiceData && (
        <InvoiceModal
          invoice={invoiceData}
          order={order}
          onClose={() => setIsInvoiceModalOpen(false)}
        />
      )}
    </div>
  );
}
