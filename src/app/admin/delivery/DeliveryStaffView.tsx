"use client";

import React, { useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdmin } from "@/context/AdminContext";
import {
  Truck,
  MapPin,
  CheckCircle2,
  Phone,
  Thermometer
} from "lucide-react";

interface DeliveryStaffViewProps {
  userEmail?: string;
}

export function DeliveryStaffView({ userEmail }: DeliveryStaffViewProps) {
  const { dispatches, updateDeliveryStop, showToast } = useAdmin();

  // Active delivery batch for driver Suresh
  const activeDispatch = dispatches.find((d) => d.id === "dispatch-104") || dispatches[0];

  const [reeferTemp] = useState("-18.4°C");
  const [checklist, setChecklist] = useState({
    sealVerified: true,
    tempValidated: true,
    cratesCounted: true,
    safetyEquipReady: true
  });

  const handleToggleCheck = (key: keyof typeof checklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleMarkDelivered = (orderId: string, branchName: string) => {
    if (!activeDispatch) return;
    updateDeliveryStop(activeDispatch.id, orderId, "delivered", 1400, "Delivered in person with temperature check verified");
    showToast(`Delivery confirmed at ${branchName}`, "success");
  };

  const totalCrates = activeDispatch ? Math.floor(activeDispatch.totalUnits / 10) : 380;

  return (
    <AdminShell
      title="Youback Icespot Factory"
      subtitle="Cold-Chain Transport &amp; Reefer Fleet Operations"
      roleBadgeText="STAFF ADMIN"
      roleBadgeColor="sky"
      userEmail={userEmail || "staff@icespot.com"}
    >
      {/* SECTION 1: Assigned Vehicle & Cold Chain Status */}
      <div className="bg-white rounded-[22px] border border-rose-100/90 shadow-[0_4px_24px_rgba(216,49,98,0.04)] p-6 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-5 border-b border-slate-100 gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100 text-sky-700 flex items-center justify-center flex-shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-wider uppercase text-slate-900">
                ASSIGNED VEHICLE &amp; COLD-CHAIN STATUS
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                {activeDispatch?.vehicleNumber || "Reefer Van #01 (KL-48-Q-4102)"} &bull; Driver: {activeDispatch?.driverName || "Suresh K."} &bull; Varavoor Factory Loading Bay
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
              <Thermometer className="w-3.5 h-3.5 text-emerald-600" />
              <span>{reeferTemp} Optimal</span>
            </span>
          </div>
        </div>

        {/* 2-Column Pre-Departure / Cold Chain Checklist */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-slate-200/80 rounded-2xl p-4 bg-white flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Digital Cooling Unit Log</h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">Continuous deep freeze at -18.4&deg;C verified</p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleCheck("tempValidated")}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                checklist.tempValidated
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              {checklist.tempValidated ? "● Verified Active" : "Pending Check"}
            </button>
          </div>

          <div className="border border-slate-200/80 rounded-2xl p-4 bg-white flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Factory Cargo Seal #KL-4102</h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">Rear container door tamper seal intact</p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleCheck("sealVerified")}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                checklist.sealVerified
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              {checklist.sealVerified ? "● Seal Intact" : "Verify Seal"}
            </button>
          </div>

          <div className="border border-slate-200/80 rounded-2xl p-4 bg-white flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Physical Crate Count</h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{totalCrates} Crates loaded against Manifest #{activeDispatch?.manifestNumber || "DSP-089"}</p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleCheck("cratesCounted")}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                checklist.cratesCounted
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              {checklist.cratesCounted ? "● Loaded 100%" : "Count Crates"}
            </button>
          </div>

          <div className="border border-slate-200/80 rounded-2xl p-4 bg-white flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Safety &amp; Thermal Blanket</h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">Thermal partition curtain secured</p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleCheck("safetyEquipReady")}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                checklist.safetyEquipReady
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              {checklist.safetyEquipReady ? "● Ready" : "Check Blanket"}
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 2: Scheduled Parlour Delivery Stops */}
      <div className="bg-white rounded-[22px] border border-rose-100/90 shadow-[0_4px_24px_rgba(216,49,98,0.04)] p-6 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-5 border-b border-slate-100 gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100 text-sky-700 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-wider uppercase text-slate-900">
                PARLOUR DELIVERY STOPS TODAY
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Route: Thrissur Central &bull; Confirm parlour arrival, verify crate handover, and log delivery proof
              </p>
            </div>
          </div>

          <div className="text-xs font-bold text-slate-500">
            {activeDispatch?.stops.length || 3} Parlour Drop-offs
          </div>
        </div>

        {/* 2-Column Grid of Assigned Stops */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeDispatch?.stops.map((stop, idx) => {
            const isDelivered = stop.status === "delivered";
            const isInTransit = stop.status === "in-transit";
            const stopCrates = stop.items.reduce((acc, it) => acc + it.requestedPacks, 0) || 120;

            return (
              <div
                key={stop.id}
                className="border border-slate-200/80 hover:border-sky-200 rounded-2xl p-4 sm:p-5 bg-white transition-all hover:shadow-xs flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-900 text-white font-black text-[10px] flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 leading-snug">
                          {stop.branchName}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 font-medium mt-1">
                        Cargo: <strong className="text-slate-900">{stopCrates} Crates</strong> ({stopCrates * 10} sticks) &bull; Order #{stop.orderNumber}
                      </p>
                    </div>

                    {/* Status Pill */}
                    <div>
                      {isDelivered && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>DELIVERED</span>
                        </span>
                      )}
                      {isInTransit && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></span>
                          <span>EN ROUTE</span>
                        </span>
                      )}
                      {stop.status === "pending" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          <span>NEXT STOP</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>Manager Phone: <strong>{stop.phone || "+91 94471 20013"}</strong></span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  {!isDelivered ? (
                    <button
                      onClick={() => handleMarkDelivered(stop.orderId, stop.branchName)}
                      type="button"
                      className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#1E293B] rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Mark Delivered</span>
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Handover Confirmed</span>
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
