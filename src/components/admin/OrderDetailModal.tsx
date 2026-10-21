"use client";

import React, { useState } from "react";
import { AdminOrder, OrderItem } from "@/types/admin";
import { useAdmin } from "@/context/AdminContext";
import { StatusBadge } from "./StatusBadge";
import { PrintablePackingSlip } from "./PrintablePackingSlip";
import {
  X,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Printer,
  Clock,
  AlertTriangle,
  Building2,
  Calendar,
  FileText,
  Boxes
} from "lucide-react";

interface OrderDetailModalProps {
  order: AdminOrder | null;
  onClose: () => void;
  onOpenReceiveModal?: (order: AdminOrder) => void;
}

export function OrderDetailModal({
  order,
  onClose,
  onOpenReceiveModal
}: OrderDetailModalProps) {
  const {
    demoRole,
    products,
    approveOrder,
    rejectOrder,
    returnOrderForCorrection,
    cancelOrder,
    requestAmendment
  } = useAdmin();

  // Local state for approval edits
  const [approvedPacksMap, setApprovedPacksMap] = useState<Record<string, number>>(() => {
    if (!order) return {};
    const map: Record<string, number> = {};
    order.items.forEach((it) => {
      map[it.productId] = it.approvedPacks > 0 ? it.approvedPacks : it.requestedPacks;
    });
    return map;
  });

  const [factoryNoteInput, setFactoryNoteInput] = useState("");
  const [rejectReasonInput, setRejectReasonInput] = useState("");
  const [amendmentNoteInput, setAmendmentNoteInput] = useState("");
  const [correctionNoteInput, setCorrectionNoteInput] = useState("");

  const [activeActionModal, setActiveActionModal] = useState<
    "none" | "reject" | "correct" | "cancel" | "amendment" | "print"
  >("none");

  if (!order) return null;

  const isSuperAdmin = demoRole === "super-admin";
  const isBranchAdmin = demoRole === "branch-admin";
  const isPendingReview = order.status === "submitted" || order.status === "under-review";
  const isApprovedLocked =
    order.status === "approved" ||
    order.status === "preparation" ||
    order.status === "ready-for-dispatch" ||
    order.status === "dispatched";

  // Calculate total units being approved
  const totalApprovedUnits = order.items.reduce((sum, item) => {
    const packs = approvedPacksMap[item.productId] ?? item.requestedPacks;
    const prod = products.find((p) => p.id === item.productId);
    return sum + packs * (prod?.unitsPerPack || 24);
  }, 0);

  const handleApprove = () => {
    approveOrder(order.id, approvedPacksMap, factoryNoteInput || undefined);
    onClose();
  };

  const handleRejectConfirm = () => {
    if (!rejectReasonInput.trim()) {
      alert("Please provide a reason for order rejection.");
      return;
    }
    rejectOrder(order.id, rejectReasonInput);
    setActiveActionModal("none");
    onClose();
  };

  const handleCorrectionConfirm = () => {
    if (!correctionNoteInput.trim()) {
      alert("Please provide feedback for correction.");
      return;
    }
    returnOrderForCorrection(order.id, correctionNoteInput);
    setActiveActionModal("none");
    onClose();
  };

  const handleCancelConfirm = () => {
    if (!rejectReasonInput.trim()) {
      alert("Please enter cancellation reason.");
      return;
    }
    cancelOrder(order.id, rejectReasonInput);
    setActiveActionModal("none");
    onClose();
  };

  const handleAmendmentSubmit = () => {
    if (!amendmentNoteInput.trim()) {
      alert("Please specify the requested amendment changes.");
      return;
    }
    requestAmendment(order.id, amendmentNoteInput);
    setActiveActionModal("none");
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6 flex flex-col max-h-[90vh]">
          {/* Modal Header */}
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-[#D83162] font-black text-sm">
                ORD
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900 leading-tight">
                    {order.orderNumber}
                  </h2>
                  <StatusBadge status={order.status} />
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                  <span className="font-semibold text-slate-700">{order.branchName}</span>
                  <span>&bull;</span>
                  <span>{order.district}</span>
                  <span>&bull;</span>
                  <span>Submitted {order.submittedAt}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveActionModal("print")}
                className="p-2 rounded-xl text-slate-600 hover:bg-slate-200/60 border border-slate-200 transition-colors"
                title="Print Packing Slip"
              >
                <Printer className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Status Guidance Banner */}
            {order.status === "submitted" && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Awaiting Factory Approval</div>
                  <p className="mt-0.5 text-amber-800 leading-relaxed">
                    {isBranchAdmin
                      ? "Your weekly order has been received by Varavoor Central Factory. You may modify or cancel this order at any time until factory dispatch approval."
                      : "Review requested quantities against Varavoor cold storage availability. You can adjust approved packs if inventory is constrained."}
                  </p>
                </div>
              </div>
            )}

            {isApprovedLocked && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Approved &amp; Reserved in Cold Storage</div>
                  <p className="mt-0.5 text-emerald-800 leading-relaxed">
                    {isBranchAdmin
                      ? "This order has been locked and scheduled for dispatch. Direct changes are disabled. If urgent adjustments are needed, use the 'Request Amendment' button below."
                      : "Order locked. Inventory has been deducted from available stock and reserved for loading."}
                  </p>
                </div>
              </div>
            )}

            {order.status === "amendment-requested" && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 text-xs flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Amendment Requested by Branch</div>
                  <p className="mt-0.5 text-rose-900 font-medium">
                    &ldquo;{order.amendmentNotes}&rdquo;
                  </p>
                </div>
              </div>
            )}

            {/* Order Meta Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
              <div>
                <span className="font-semibold text-slate-500 uppercase text-[10px] block mb-0.5">
                  Requested Delivery Cycle
                </span>
                <span className="font-bold text-slate-900 text-sm">
                  {order.requestedDeliveryDate}
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-500 uppercase text-[10px] block mb-0.5">
                  Requested Total Units
                </span>
                <span className="font-bold text-slate-900 text-sm">
                  {order.totalUnitsRequested} sticks / units
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-500 uppercase text-[10px] block mb-0.5">
                  Approved Total Units
                </span>
                <span className="font-bold text-[#D83162] text-sm">
                  {order.status === "submitted" || order.status === "under-review"
                    ? `${totalApprovedUnits} (Pending Confirmation)`
                    : `${order.totalUnitsApproved} sticks / units`}
                </span>
              </div>
            </div>

            {/* Product Items Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Boxes className="w-4 h-4 text-slate-400" />
                  Order Product Lines ({order.items.length})
                </h3>
                {isSuperAdmin && isPendingReview && (
                  <span className="text-[11px] text-[#D83162] font-semibold">
                    * Adjust approved crates if factory stock is insufficient
                  </span>
                )}
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5">Product</th>
                      <th className="px-3 py-2.5">Pack Type</th>
                      <th className="px-3 py-2.5 text-right">Requested</th>
                      <th className="px-3 py-2.5 text-center">Factory Stock</th>
                      <th className="px-4 py-2.5 text-right">
                        {isSuperAdmin && isPendingReview ? "Approved Crates" : "Approved Units"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.items.map((it) => {
                      const prod = products.find((p) => p.id === it.productId);
                      const currentPacks = approvedPacksMap[it.productId] ?? it.requestedPacks;
                      const unitsPerPack = prod?.unitsPerPack || 24;
                      const hasLowStock = prod ? prod.currentStock < currentPacks * unitsPerPack : false;

                      return (
                        <tr key={it.productId} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900">{it.productName}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{it.sku}</div>
                          </td>
                          <td className="px-3 py-3 text-slate-600">{it.packType}</td>
                          <td className="px-3 py-3 text-right">
                            <span className="font-bold text-slate-800">{it.requestedPacks}</span>{" "}
                            <span className="text-[11px] text-slate-400">
                              ({it.requestedUnits} sticks)
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {prod ? (
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                  hasLowStock
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {prod.currentStock} avail.
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
                            {isSuperAdmin && isPendingReview ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setApprovedPacksMap((prev) => ({
                                      ...prev,
                                      [it.productId]: Math.max(0, (prev[it.productId] ?? it.requestedPacks) - 1)
                                    }))
                                  }
                                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs"
                                >
                                  -
                                </button>
                                <span className="w-8 text-center">{currentPacks}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setApprovedPacksMap((prev) => ({
                                      ...prev,
                                      [it.productId]: (prev[it.productId] ?? it.requestedPacks) + 1
                                    }))
                                  }
                                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs"
                                >
                                  +
                                </button>
                                <span className="text-[11px] text-slate-400 ml-1">
                                  ({currentPacks * unitsPerPack} u)
                                </span>
                              </div>
                            ) : (
                              <span>
                                {it.approvedPacks || it.requestedPacks} crates (
                                {it.approvedUnits || it.requestedUnits} units)
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notes Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="font-bold text-slate-600 uppercase text-[10px] block mb-1">
                  Branch Notes
                </span>
                <p className="text-slate-700 italic">
                  {order.branchNotes ? `“${order.branchNotes}”` : "No special instructions provided."}
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="font-bold text-slate-600 uppercase text-[10px] block mb-1">
                  Factory Notes
                </span>
                {isSuperAdmin && isPendingReview ? (
                  <input
                    type="text"
                    value={factoryNoteInput}
                    onChange={(e) => setFactoryNoteInput(e.target.value)}
                    placeholder="Enter factory remarks for packing crew..."
                    className="w-full text-xs p-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#D83162]"
                  />
                ) : (
                  <p className="text-slate-700">
                    {order.factoryNotes || "Standard cold-chain packing protocol applied."}
                  </p>
                )}
              </div>
            </div>

            {/* Order Audit Timeline */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-400" />
                Audit Trail &amp; Order Timeline
              </h3>
              <div className="space-y-3 pl-3 border-l-2 border-slate-200">
                {order.timeline.map((ev) => (
                  <div key={ev.id} className="relative text-xs">
                    <span className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full bg-[#D83162]"></span>
                    <div className="font-semibold text-slate-800">
                      {ev.actorName} &bull;{" "}
                      <span className="text-[11px] text-slate-400 font-normal">{ev.timestamp}</span>
                    </div>
                    {ev.note && <div className="text-slate-600 mt-0.5">{ev.note}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Modal Footer / Actions */}
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
            >
              Close Window
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {/* Branch Admin Actions */}
              {isBranchAdmin && order.status === "submitted" && (
                <button
                  onClick={() => setActiveActionModal("cancel")}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold rounded-xl transition-colors"
                >
                  Cancel Order
                </button>
              )}

              {isBranchAdmin && isApprovedLocked && (
                <button
                  onClick={() => setActiveActionModal("amendment")}
                  className="px-4 py-2 bg-[#6D0C27] hover:bg-[#8E1035] text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
                >
                  Request Amendment
                </button>
              )}

              {isBranchAdmin && order.status === "delivered" && onOpenReceiveModal && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenReceiveModal(order);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
                >
                  Confirm Physical Receipt
                </button>
              )}

              {/* Super Admin Actions */}
              {isSuperAdmin && isPendingReview && (
                <>
                  <button
                    onClick={() => setActiveActionModal("correct")}
                    className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold rounded-xl transition-colors"
                  >
                    Return for Correction
                  </button>
                  <button
                    onClick={() => setActiveActionModal("reject")}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-200 text-xs font-bold rounded-xl transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={handleApprove}
                    className="px-5 py-2 bg-[#D83162] hover:bg-[#B51B47] text-white text-xs font-extrabold rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve Order ({totalApprovedUnits} units)
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reject / Cancel / Correction Sub-Modals */}
      {activeActionModal === "reject" && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              Reject Order {order.orderNumber}?
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Please record a reason for rejection. The branch will be notified.
            </p>
            <textarea
              rows={3}
              value={rejectReasonInput}
              onChange={(e) => setRejectReasonInput(e.target.value)}
              placeholder="e.g., Seasonal fruit shortage; duplicate submission..."
              className="w-full text-xs p-3 border border-slate-200 rounded-xl mb-4 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setActiveActionModal("none")}
                className="px-3.5 py-2 text-xs font-medium text-slate-600"
              >
                Back
              </button>
              <button
                onClick={handleRejectConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {activeActionModal === "cancel" && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              Cancel Order {order.orderNumber}?
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              As the order has not yet been approved by the factory, you can cancel it immediately.
            </p>
            <textarea
              rows={3}
              value={rejectReasonInput}
              onChange={(e) => setRejectReasonInput(e.target.value)}
              placeholder="Reason for cancellation..."
              className="w-full text-xs p-3 border border-slate-200 rounded-xl mb-4 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setActiveActionModal("none")}
                className="px-3.5 py-2 text-xs font-medium text-slate-600"
              >
                Keep Order
              </button>
              <button
                onClick={handleCancelConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl"
              >
                Cancel Order Now
              </button>
            </div>
          </div>
        </div>
      )}

      {activeActionModal === "correct" && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              Return Order for Correction
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Describe what the branch needs to adjust before the order can be approved.
            </p>
            <textarea
              rows={3}
              value={correctionNoteInput}
              onChange={(e) => setCorrectionNoteInput(e.target.value)}
              placeholder="e.g. Please reduce Mango crates to 4 or select Guava substitution..."
              className="w-full text-xs p-3 border border-slate-200 rounded-xl mb-4 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setActiveActionModal("none")}
                className="px-3.5 py-2 text-xs font-medium text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleCorrectionConfirm}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl"
              >
                Return to Branch
              </button>
            </div>
          </div>
        </div>
      )}

      {activeActionModal === "amendment" && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              Request Order Amendment
            </h3>
            <p className="text-xs text-slate-600 mb-3">
              This order is already approved. The original approved record will be preserved, and your amendment request will be sent to the Varavoor dispatch supervisor.
            </p>
            <textarea
              rows={4}
              value={amendmentNoteInput}
              onChange={(e) => setAmendmentNoteInput(e.target.value)}
              placeholder="Explain required changes: e.g. Add 2 Crates of Sweet Strawberry due to catering booking..."
              className="w-full text-xs p-3 border border-slate-200 rounded-xl mb-4 focus:outline-none focus:ring-1 focus:ring-[#D83162]"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setActiveActionModal("none")}
                className="px-3.5 py-2 text-xs font-medium text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleAmendmentSubmit}
                className="px-4 py-2 bg-[#D83162] hover:bg-[#B51B47] text-white text-xs font-bold rounded-xl"
              >
                Submit Amendment Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Slip Preview */}
      {activeActionModal === "print" && (
        <PrintablePackingSlip order={order} onClose={() => setActiveActionModal("none")} />
      )}
    </>
  );
}
