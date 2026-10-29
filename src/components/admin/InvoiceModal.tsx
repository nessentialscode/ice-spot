"use client";

import React from "react";
import { Invoice, AdminOrder } from "@/types/admin";
import { Printer, X, FileText, CheckCircle2 } from "lucide-react";

interface InvoiceModalProps {
  invoice: Invoice | null;
  order?: AdminOrder | null;
  onClose: () => void;
}

export function InvoiceModal({ invoice, order, onClose }: InvoiceModalProps) {
  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = new Date(invoice.invoiceDate).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6 flex flex-col max-h-[92vh]">
        {/* Modal Controls (Hidden in print) */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 text-[#D83162] flex items-center justify-center font-black text-xs">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Provisional Commercial Invoice Details
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Provisional dispatch invoice for Order #{invoice.orderNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              type="button"
              className="flex items-center gap-1.5 px-4 py-2 bg-[#D83162] hover:bg-[#B51B47] text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={onClose}
              type="button"
              className="p-2 text-slate-400 hover:text-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PRINTABLE INVOICE CONTENT */}
        <div className="p-8 overflow-y-auto flex-1 font-sans text-slate-900 print:p-0 print:overflow-visible">
          {/* Invoice Header */}
          <div className="flex flex-col sm:flex-row items-start justify-between pb-6 border-b-2 border-slate-900 gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md inline-block mb-1">
                PROVISIONAL COMMERCIAL INVOICE
              </span>
              <h1 className="text-2xl font-black tracking-tight text-[#6D0C27] mt-0.5">
                ICE SPOT ENTERPRISES
              </h1>
              <p className="text-xs text-slate-600 font-semibold mt-1">
                Varavoor Central Production &amp; Cold-Chain Distribution Hub
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                Varavoor, Wadakkanchery, Thrissur District, Kerala — 680585<br />
                Phone: +91 94470 00000 &bull; Email: accounts@icespot.com
              </p>
              <div className="mt-2 inline-flex items-center gap-2 text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                <span>GSTIN: <strong className="text-slate-700">Pending Configuration</strong></span>
                <span>&bull;</span>
                <span>FSSAI: <strong className="text-slate-700">Pending Configuration</strong></span>
              </div>
            </div>

            <div className="text-left sm:text-right flex flex-col sm:items-end">
              <span className="inline-block px-3 py-1 bg-slate-100 font-mono text-xs font-black border border-slate-300 rounded-lg text-slate-900">
                {invoice.invoiceNumber}
              </span>
              <div className="mt-2 text-xs text-slate-600 font-medium">
                <div>Invoice Date: <strong className="text-slate-900">{formattedDate}</strong></div>
                <div>Order Ref: <strong className="text-slate-900">#{invoice.orderNumber}</strong></div>
                <div className="mt-1">
                  Status:{" "}
                  <span className={`inline-flex items-center gap-1 font-black uppercase text-[10px] px-2 py-0.5 rounded border ${
                    invoice.status === "provisional"
                      ? "bg-amber-50 text-amber-800 border-amber-200"
                      : "bg-emerald-50 text-emerald-800 border-emerald-200"
                  }`}>
                    <CheckCircle2 className="w-3 h-3 text-amber-600" />
                    <span>{invoice.status}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Billed To / Destination Branch Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-5 border-b border-slate-200 text-xs">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                Billed To (Branch Parlour)
              </span>
              <h4 className="text-sm font-black text-slate-900">
                {invoice.branchName} {invoice.branchCode ? `(${invoice.branchCode})` : ""}
              </h4>
              <p className="text-slate-600 mt-1 leading-relaxed">
                {invoice.branchAddress}
              </p>
              <p className="text-slate-500 mt-1">
                District: <strong>{invoice.district || "Thrissur"}</strong> &bull; Kerala, India
              </p>
              {invoice.branchPhone && (
                <p className="text-slate-500 mt-0.5">
                  Contact: <strong>{invoice.branchPhone}</strong>
                </p>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Dispatch &amp; Cold-Chain Manifest
                </span>
                <p className="text-slate-700 font-semibold">
                  Origin: Varavoor Central Cold Storage (-18°C Deep Freeze)
                </p>
                <p className="text-slate-500 mt-1 text-[11px]">
                  Goods inspected, temperature-verified, and sealed for parlour delivery.
                </p>
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-2 pt-2 border-t border-slate-200/60">
                Order ID: {invoice.orderId}
              </div>
            </div>
          </div>

          {/* Product Items Table */}
          <div className="py-5">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase font-black text-[10px] tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-3 text-center w-12">#</th>
                  <th className="py-2.5 px-3">Flavour SKU &amp; Description</th>
                  <th className="py-2.5 px-3 text-center">Approved Boxes</th>
                  <th className="py-2.5 px-3 text-right">Unit Price (₹)</th>
                  <th className="py-2.5 px-3 text-right">Line Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.items.map((it, idx) => (
                  <tr key={it.productId || idx} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 text-center text-slate-400 font-mono">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-slate-900 block">{it.productName}</span>
                      <span className="text-[10px] font-mono text-slate-400">SKU: {it.sku}</span>
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-800">
                      {it.quantity} Boxes
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-700">
                      ₹{it.unitPrice.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                      ₹{it.lineTotal.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals & Tax Calculation Breakdown */}
          <div className="flex flex-col sm:flex-row items-start justify-between pt-4 border-t-2 border-slate-900 gap-6">
            <div className="max-w-md text-[11px] text-slate-500 space-y-1.5">
              <div className="font-bold uppercase tracking-wider text-slate-700 text-[10px]">
                Tax &amp; Regulatory Disclosure:
              </div>
              <p className="leading-relaxed bg-amber-50 text-amber-900 p-2.5 rounded-xl border border-amber-200/80">
                PROVISIONAL COMMERCIAL INVOICE — GST not calculated; tax configuration pending confirmation. 
                Unit prices shown reflect configured catalogue transfer values.
              </p>
              {invoice.notes && (
                <p className="text-slate-500 italic">
                  Notes: {invoice.notes}
                </p>
              )}
            </div>

            <div className="w-full sm:w-64 space-y-2 text-xs">
              <div className="flex justify-between py-1 text-slate-600 font-medium">
                <span>Subtotal:</span>
                <span className="font-mono font-bold text-slate-900">₹{invoice.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 text-slate-600 font-medium">
                <span>CGST:</span>
                <span className="font-mono text-slate-600 font-semibold">Pending Configuration</span>
              </div>
              <div className="flex justify-between py-1 text-slate-600 font-medium pb-2 border-b border-slate-200">
                <span>SGST:</span>
                <span className="font-mono text-slate-600 font-semibold">Pending Configuration</span>
              </div>
              <div className="flex justify-between py-2 text-sm font-black text-slate-900 border-t border-slate-900">
                <span>Grand Total:</span>
                <span className="font-mono text-base text-[#D83162]">₹{invoice.grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Signatures & Footer */}
          <div className="mt-10 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-4">
            <div>
              <p className="font-bold text-slate-600">Youback Icespot Enterprises</p>
              <p className="text-[10px] mt-0.5">Varavoor Central Production &amp; Cold Logistics Hub</p>
            </div>
            <div className="text-center sm:text-right">
              <div className="h-8 border-b border-slate-300 w-44 mb-1"></div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Authorized Signatory / Dispatcher
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
