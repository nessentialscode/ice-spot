"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdmin } from "@/context/AdminContext";
import {
  Menu,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRightLeft,
  ChevronDown
} from "lucide-react";

interface AdminTopbarProps {
  title: string;
  subtitle?: string;
  onOpenMobileMenu?: () => void;
}

export function AdminTopbar({
  title,
  subtitle,
  onOpenMobileMenu
}: AdminTopbarProps) {
  const pathname = usePathname();
  const { demoRole, orders, products, discrepancies } = useAdmin();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Generate sample operational notifications from current state
  const pendingOrders = orders.filter((o) => o.status === "submitted");
  const lowStockProducts = products.filter((p) => p.currentStock <= p.minStockAlert);
  const activeIssues = discrepancies.filter((d) => d.status === "open");

  const notificationCount =
    pendingOrders.length + lowStockProducts.length + activeIssues.length;

  const currentUserName =
    demoRole === "super-admin"
      ? "M. Faizal (Factory Operations Mgr)"
      : demoRole === "branch-admin"
      ? "Rahul Varma (Ollur Branch Mgr)"
      : "Suresh K. (Logistics Driver)";

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between">
      {/* Left: Mobile hamburger + Titles */}
      <div className="flex items-center gap-3">
        {onOpenMobileMenu && (
          <button
            onClick={onOpenMobileMenu}
            className="p-2 -ml-2 rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-none">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Prototype Indicator Badge */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-xs font-semibold text-[#8E1035]">
          <span className="w-2 h-2 rounded-full bg-[#D83162] animate-ping"></span>
          <span>Frontend UI Prototype</span>
        </div>

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserMenu(false);
            }}
            className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 relative transition-colors"
            title="Operational Notifications"
          >
            <Bell className="w-5 h-5" />
            {notificationCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#D83162] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {notificationCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50 animate-fade-in">
              <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Operational Alerts
                </span>
                <span className="text-[10px] font-bold bg-[#D83162]/10 text-[#D83162] px-2 py-0.5 rounded-full">
                  {notificationCount} Active
                </span>
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {pendingOrders.map((ord) => (
                  <div key={ord.id} className="p-3 hover:bg-slate-50 flex items-start gap-2.5">
                    <Clock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="text-xs">
                      <p className="font-semibold text-slate-800">
                        New Order from {ord.branchName}
                      </p>
                      <p className="text-slate-500 mt-0.5">
                        {ord.orderNumber} ({ord.totalUnitsRequested} units) submitted for review.
                      </p>
                    </div>
                  </div>
                ))}

                {lowStockProducts.map((p) => (
                  <div key={p.id} className="p-3 hover:bg-slate-50 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
                    <div className="text-xs">
                      <p className="font-semibold text-rose-900">
                        Low Stock Alert: {p.name}
                      </p>
                      <p className="text-slate-500 mt-0.5">
                        {p.currentStock} units remaining (Alert threshold: {p.minStockAlert}).
                      </p>
                    </div>
                  </div>
                ))}

                {activeIssues.map((d) => (
                  <div key={d.id} className="p-3 hover:bg-slate-50 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                    <div className="text-xs">
                      <p className="font-semibold text-orange-950">
                        Delivery Discrepancy at {d.branchName}
                      </p>
                      <p className="text-slate-500 mt-0.5">
                        {d.notes}
                      </p>
                    </div>
                  </div>
                ))}

                {notificationCount === 0 && (
                  <div className="p-6 text-center text-xs text-slate-500 flex flex-col items-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                    All operational queues are clear!
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Demo Role Quick Switch Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowNotifications(false);
            }}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            <div className="w-7 h-7 rounded-lg bg-[#6D0C27] text-white flex items-center justify-center font-bold text-xs">
              {currentUserName.charAt(0)}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-bold text-slate-800 leading-tight">
                {currentUserName.split(" ")[0]}
              </div>
              <div className="text-[10px] text-slate-500 capitalize">
                {demoRole.replace("-", " ")}
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50 animate-fade-in">
              <div className="px-3 py-2 border-b border-slate-100 mb-1">
                <div className="text-xs font-bold text-slate-800">
                  {currentUserName}
                </div>
                <div className="text-[11px] text-slate-500 capitalize">
                  Role: {demoRole.replace("-", " ")}
                </div>
              </div>

              <div className="text-[10px] uppercase font-bold text-slate-400 px-3 py-1">
                Switch Role View
              </div>

              <Link
                href="/admin/super-admin"
                onClick={() => setShowUserMenu(false)}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium ${
                  pathname.includes("super-admin")
                    ? "bg-rose-50 text-[#D83162] font-bold"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span>Varavoor Factory (Super Admin)</span>
                {pathname.includes("super-admin") && "✓"}
              </Link>

              <Link
                href="/admin/branch"
                onClick={() => setShowUserMenu(false)}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium ${
                  pathname.includes("branch")
                    ? "bg-rose-50 text-[#D83162] font-bold"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span>Branch Admin (Franchise)</span>
                {pathname.includes("branch") && "✓"}
              </Link>

              <Link
                href="/admin/delivery"
                onClick={() => setShowUserMenu(false)}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium ${
                  pathname.includes("delivery")
                    ? "bg-rose-50 text-[#D83162] font-bold"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span>Delivery Staff (Logistics)</span>
                {pathname.includes("delivery") && "✓"}
              </Link>

              <div className="border-t border-slate-100 mt-1 pt-1">
                <Link
                  href="/admin"
                  onClick={() => setShowUserMenu(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />
                  Role Selector Hub
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
