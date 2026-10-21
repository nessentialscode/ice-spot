import React from "react";
import { OrderStatus, DeliveryTripStatus, StopDeliveryStatus } from "@/types/admin";

interface StatusBadgeProps {
  status: OrderStatus | DeliveryTripStatus | StopDeliveryStatus | string;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const s = status.toLowerCase();

  let label = status;
  let bg = "bg-slate-100 text-slate-700 border-slate-200";
  let dot = "bg-slate-400";

  switch (s) {
    // Orders
    case "draft":
      label = "Draft";
      bg = "bg-slate-100 text-slate-700 border-slate-200";
      dot = "bg-slate-400";
      break;
    case "submitted":
      label = "Submitted";
      bg = "bg-amber-50 text-amber-800 border-amber-200";
      dot = "bg-amber-500";
      break;
    case "under-review":
      label = "Under Review";
      bg = "bg-purple-50 text-purple-800 border-purple-200";
      dot = "bg-purple-500";
      break;
    case "approved":
      label = "Approved";
      bg = "bg-emerald-50 text-emerald-800 border-emerald-200";
      dot = "bg-emerald-500";
      break;
    case "preparation":
      label = "In Preparation";
      bg = "bg-blue-50 text-blue-800 border-blue-200";
      dot = "bg-blue-500";
      break;
    case "ready-for-dispatch":
    case "ready":
      label = "Ready to Dispatch";
      bg = "bg-indigo-50 text-indigo-800 border-indigo-200";
      dot = "bg-indigo-500";
      break;
    case "dispatched":
    case "in-transit":
      label = "In Transit";
      bg = "bg-sky-50 text-sky-800 border-sky-200";
      dot = "bg-sky-500";
      break;
    case "partially-delivered":
      label = "Partial Delivery";
      bg = "bg-orange-50 text-orange-800 border-orange-200";
      dot = "bg-orange-500";
      break;
    case "delivered":
    case "completed":
      label = "Delivered";
      bg = "bg-teal-50 text-teal-800 border-teal-200";
      dot = "bg-teal-500";
      break;
    case "amendment-requested":
      label = "Amendment Req.";
      bg = "bg-rose-50 text-rose-800 border-rose-200";
      dot = "bg-rose-500";
      break;
    case "cancelled":
    case "failed":
    case "issues":
      label = s === "failed" ? "Delivery Failed" : s === "issues" ? "Action Needed" : "Cancelled";
      bg = "bg-red-50 text-red-800 border-red-200";
      dot = "bg-red-500";
      break;
    case "loading":
      label = "Loading Bay";
      bg = "bg-amber-50 text-amber-800 border-amber-200";
      dot = "bg-amber-500";
      break;
    case "scheduled":
      label = "Scheduled";
      bg = "bg-slate-100 text-slate-700 border-slate-200";
      dot = "bg-slate-400";
      break;
    case "reached":
      label = "Vehicle Arrived";
      bg = "bg-cyan-50 text-cyan-800 border-cyan-200";
      dot = "bg-cyan-500";
      break;
    case "pending":
      label = "Pending";
      bg = "bg-slate-100 text-slate-600 border-slate-200";
      dot = "bg-slate-400";
      break;
    default:
      label = status;
  }

  const px = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${bg} ${px} whitespace-nowrap`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`}></span>
      {label}
    </span>
  );
}
