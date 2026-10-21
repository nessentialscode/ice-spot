"use client";

import React from "react";
import { AdminOrder, DispatchBatch } from "@/types/admin";
import { Printer, X } from "lucide-react";

interface PrintablePackingSlipProps {
  order?: AdminOrder | null;
  dispatch?: DispatchBatch | null;
  onClose: () => void;
}

export function PrintablePackingSlip({
  order,
  dispatch,
  onClose
}: PrintablePackingSlipProps) {
  if (!order && !dispatch) return null;

  const handlePrint = () => {
    window.print();
  };

  const manifestCode = dispatch?.manifestNumber || `PACK-${order?.orderNumber}`;
  const generatedDate = new Date().toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      {/* Container */}
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 my-8">
        {/* Modal Controls (Hidden in print) */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#D83162]">
              Print Preview
            </span>
            <span className="text-xs text-slate-500 font-medium">
              &bull; Standard A4 Dispatch &amp; Delivery Manifest
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#D83162] hover:bg-[#B51B47] text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save as PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-xl"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PRINTABLE SLIP CONTENT */}
        <div className="printable-content text-slate-900 font-sans p-2">
          {/* Header */}
          <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4 mb-4">
            <div>
              <div className="text-xl font-black tracking-tight text-[#6D0C27]">
                ICE SPOT HANDCRAFTED ICE CREAMS
              </div>
              <div className="text-xs text-slate-600 font-semibold mt-0.5">
                Central Production Factory &amp; Distribution Hub
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Varavoor, Wadakkanchery, Thrissur, Kerala — 680585 &bull; Ph: +91 94470 00000
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block px-2.5 py-1 bg-slate-100 font-mono text-xs font-bold border border-slate-300 rounded">
                {manifestCode}
              </span>
              <div className="text-[11px] text-slate-500 mt-1">Generated: {generatedDate}</div>
            </div>
          </div>

          {/* Logistics Summary Grid */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs mb-5">
            <div>
              <div className="font-bold text-slate-500 uppercase text-[10px] mb-1">
                Dispatch Details
              </div>
              <div>
                <span className="font-semibold text-slate-700">Vehicle: </span>
                {dispatch?.vehicleNumber || "Factory Logistics Van"}
              </div>
              <div>
                <span className="font-semibold text-slate-700">Driver / Staff: </span>
                {dispatch?.driverName || "Assigned Driver"} ({dispatch?.driverPhone || "+91 98460 00000"})
              </div>
            </div>

            <div>
              <div className="font-bold text-slate-500 uppercase text-[10px] mb-1">
                Destination Branch
              </div>
              <div className="font-bold text-slate-900">
                {order ? order.branchName : dispatch?.stops[0]?.branchName || "All Route Branches"}
              </div>
              <div className="text-[11px] text-slate-600">
                {order ? `District: ${order.district}` : `${dispatch?.stops.length || 1} Delivery Stops`}
              </div>
            </div>
          </div>

          {/* Product Items Table */}
          <table className="w-full text-xs text-left border-collapse border border-slate-300 mb-6">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase text-[10px]">
                <th className="p-2 border-r border-slate-300">#</th>
                <th className="p-2 border-r border-slate-300">Product / Flavour</th>
                <th className="p-2 border-r border-slate-300">SKU</th>
                <th className="p-2 border-r border-slate-300 text-center">Pack Type</th>
                <th className="p-2 border-r border-slate-300 text-right">Qty (Packs)</th>
                <th className="p-2 border-r border-slate-300 text-right">Total Units</th>
                <th className="p-2 text-center w-20">Received Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {order ? (
                order.items.map((it, idx) => (
                  <tr key={it.productId} className="hover:bg-slate-50">
                    <td className="p-2 border-r border-slate-200 text-slate-500">{idx + 1}</td>
                    <td className="p-2 border-r border-slate-200 font-bold text-slate-900">
                      {it.productName}
                    </td>
                    <td className="p-2 border-r border-slate-200 font-mono text-[11px] text-slate-600">
                      {it.sku}
                    </td>
                    <td className="p-2 border-r border-slate-200 text-center text-slate-600">
                      {it.packType}
                    </td>
                    <td className="p-2 border-r border-slate-200 text-right font-semibold">
                      {it.approvedPacks || it.requestedPacks}
                    </td>
                    <td className="p-2 border-r border-slate-200 text-right font-extrabold text-slate-900">
                      {it.approvedUnits || it.requestedUnits}
                    </td>
                    <td className="p-2 text-center border-l border-slate-200 font-mono text-slate-300">
                      [ &nbsp; ]
                    </td>
                  </tr>
                ))
              ) : dispatch ? (
                dispatch.stops.flatMap((stop) =>
                  stop.items.map((it, idx) => (
                    <tr key={`${stop.id}-${it.productId}`}>
                      <td className="p-2 border-r border-slate-200 text-slate-500">{idx + 1}</td>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-900">
                        {it.productName} <span className="text-[10px] text-slate-400">({stop.branchName})</span>
                      </td>
                      <td className="p-2 border-r border-slate-200 font-mono text-[11px] text-slate-600">
                        {it.sku}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-center text-slate-600">
                        {it.packType}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-right font-semibold">
                        {it.approvedPacks || it.requestedPacks}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-right font-extrabold text-slate-900">
                        {it.approvedUnits || it.requestedUnits}
                      </td>
                      <td className="p-2 text-center border-l border-slate-200 font-mono text-slate-300">
                        [ &nbsp; ]
                      </td>
                    </tr>
                  ))
                )
              ) : null}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-400">
                <td colSpan={5} className="p-2 text-right uppercase text-[10px]">
                  Total Dispatched Units:
                </td>
                <td className="p-2 text-right font-black text-sm text-[#8E1035]">
                  {order ? order.totalUnitsApproved || order.totalUnitsRequested : dispatch?.totalUnits}
                </td>
                <td className="p-2"></td>
              </tr>
            </tfoot>
          </table>

          {/* Operational Notes */}
          <div className="text-xs text-slate-600 border border-slate-200 p-2.5 rounded-lg mb-6 bg-slate-50/50">
            <span className="font-bold text-slate-800">Dispatch Instructions: </span>
            Maintain refrigeration cold-chain temperature between -18&deg;C and -22&deg;C throughout transit. Check seal integrity upon delivery at branch freezer bay.
          </div>

          {/* Signoff Blocks */}
          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-300 text-center text-xs">
            <div>
              <div className="h-10 border-b border-dashed border-slate-400"></div>
              <div className="font-bold text-slate-800 mt-1">Factory Dispatcher</div>
              <div className="text-[10px] text-slate-400">Varavoor Cold Storage</div>
            </div>

            <div>
              <div className="h-10 border-b border-dashed border-slate-400"></div>
              <div className="font-bold text-slate-800 mt-1">Delivery Worker</div>
              <div className="text-[10px] text-slate-400">Driver Sign &amp; Date</div>
            </div>

            <div>
              <div className="h-10 border-b border-dashed border-slate-400"></div>
              <div className="font-bold text-slate-800 mt-1">Branch Recipient</div>
              <div className="text-[10px] text-slate-400">Store Stamp &amp; Signature</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
