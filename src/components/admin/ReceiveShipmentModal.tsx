"use client";

import React, { useState } from "react";
import { AdminOrder } from "@/types/admin";
import { useAdmin } from "@/context/AdminContext";
import { CheckCircle2, AlertTriangle, X, PackageCheck, AlertCircle } from "lucide-react";

interface ReceiveShipmentModalProps {
  order: AdminOrder | null;
  onClose: () => void;
}

export function ReceiveShipmentModal({
  order,
  onClose
}: ReceiveShipmentModalProps) {
  const { receiveShipment } = useAdmin();

  // State for item counts
  const [receivedMap, setReceivedMap] = useState<Record<string, number>>(() => {
    if (!order) return {};
    const map: Record<string, number> = {};
    order.items.forEach((it) => {
      map[it.productId] = it.approvedUnits || it.requestedUnits;
    });
    return map;
  });

  const [missingMap, setMissingMap] = useState<Record<string, number>>({});
  const [damagedMap, setDamagedMap] = useState<Record<string, number>>({});
  const [discrepancyNotes, setDiscrepancyNotes] = useState("");

  if (!order) return null;

  // Totals calculation
  let totalDispatched = 0;
  let totalReceived = 0;
  let totalMissing = 0;
  let totalDamaged = 0;

  order.items.forEach((it) => {
    const dispatched = it.approvedUnits || it.requestedUnits;
    const received = receivedMap[it.productId] ?? dispatched;
    const missing = missingMap[it.productId] ?? 0;
    const damaged = damagedMap[it.productId] ?? 0;

    totalDispatched += dispatched;
    totalReceived += received;
    totalMissing += missing;
    totalDamaged += damaged;
  });

  const hasDiscrepancy = totalMissing > 0 || totalDamaged > 0;

  const handleConfirmFullIntact = () => {
    const fullMap: Record<string, number> = {};
    order.items.forEach((it) => {
      fullMap[it.productId] = it.approvedUnits || it.requestedUnits;
    });
    receiveShipment(order.id, fullMap, {}, {}, "Confirmed 100% full receipt by branch staff.");
    onClose();
  };

  const handleSubmitReceipt = () => {
    receiveShipment(
      order.id,
      receivedMap,
      missingMap,
      damagedMap,
      discrepancyNotes || undefined
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-bold">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Receive &amp; Verify Shipment — {order.orderNumber}
              </h2>
              <p className="text-xs text-slate-500">
                {order.branchName} &bull; Compare physical shipment against dispatched manifest
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl text-blue-900 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p>
              Please count individual crates and sticks before confirming receipt. Any missing or broken sticks will be recorded on the factory discrepancy register for audit and replacement credit.
            </p>
          </div>

          {/* Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold">
                <tr>
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-3 py-2.5 text-right">Dispatched</th>
                  <th className="px-3 py-2.5 text-center">Received Units</th>
                  <th className="px-3 py-2.5 text-center">Missing</th>
                  <th className="px-3 py-2.5 text-center">Damaged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.items.map((it) => {
                  const dispatched = it.approvedUnits || it.requestedUnits;
                  const received = receivedMap[it.productId] ?? dispatched;
                  const missing = missingMap[it.productId] ?? 0;
                  const damaged = damagedMap[it.productId] ?? 0;

                  return (
                    <tr key={it.productId} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{it.productName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{it.sku} &bull; {it.packType}</div>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-slate-700">
                        {dispatched}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="number"
                          min={0}
                          max={dispatched}
                          value={received}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setReceivedMap((prev) => ({ ...prev, [it.productId]: val }));
                          }}
                          className="w-16 text-center text-xs p-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-teal-500 font-bold"
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="number"
                          min={0}
                          value={missing}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setMissingMap((prev) => ({ ...prev, [it.productId]: val }));
                          }}
                          className={`w-14 text-center text-xs p-1.5 border rounded-lg focus:ring-1 font-bold ${
                            missing > 0 ? "border-amber-400 bg-amber-50 text-amber-900" : "border-slate-200"
                          }`}
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="number"
                          min={0}
                          value={damaged}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setDamagedMap((prev) => ({ ...prev, [it.productId]: val }));
                          }}
                          className={`w-14 text-center text-xs p-1.5 border rounded-lg focus:ring-1 font-bold ${
                            damaged > 0 ? "border-rose-400 bg-rose-50 text-rose-900" : "border-slate-200"
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Discrepancy Note */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Discrepancy Remarks &amp; Seal Observation (Optional)
            </label>
            <textarea
              rows={2}
              value={discrepancyNotes}
              onChange={(e) => setDiscrepancyNotes(e.target.value)}
              placeholder="e.g. Van freezer temperature normal. Outer cardboard box on Strawberry showed minor moisture crush..."
              className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {/* Verification Summary Footprint */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-slate-500 block">Manifest Units:</span>
              <span className="font-extrabold text-slate-800 text-sm">{totalDispatched}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Verified Received:</span>
              <span className="font-extrabold text-teal-700 text-sm">{totalReceived}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Reported Missing:</span>
              <span className={`font-extrabold text-sm ${totalMissing > 0 ? "text-amber-600" : "text-slate-400"}`}>
                {totalMissing}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Reported Damaged:</span>
              <span className={`font-extrabold text-sm ${totalDamaged > 0 ? "text-rose-600" : "text-slate-400"}`}>
                {totalDamaged}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <button
            onClick={handleConfirmFullIntact}
            type="button"
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
          >
            Quick Confirm 100% Intact
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold text-slate-500"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitReceipt}
              className={`px-5 py-2 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-1.5 ${
                hasDiscrepancy ? "bg-amber-600 hover:bg-amber-700" : "bg-teal-600 hover:bg-teal-700"
              }`}
            >
              {hasDiscrepancy ? (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  Confirm with Discrepancy Flag
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm Full Receipt
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
