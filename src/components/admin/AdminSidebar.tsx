"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdmin } from "@/context/AdminContext";
import {
  LayoutDashboard,
  ClipboardList,
  Package,
  Boxes,
  Truck,
  Store,
  BarChart3,
  Users,
  RotateCcw,
  ExternalLink,
  ShieldAlert,
  ArrowRightLeft,
  CheckSquare,
  MapPin
} from "lucide-react";

interface AdminSidebarProps {
  currentTab?: string;
  onTabChange?: (tab: string) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function AdminSidebar({
  currentTab = "overview",
  onTabChange,
  isMobileOpen = false,
  onCloseMobile
}: AdminSidebarProps) {
  const pathname = usePathname();
  const { demoRole, setDemoRole, orders, products, dispatches, resetDemoData } = useAdmin();

  // Badges calculation
  const pendingOrdersCount = orders.filter(
    (o) => o.status === "submitted" || o.status === "under-review"
  ).length;
  const lowStockCount = products.filter(
    (p) => p.currentStock <= p.minStockAlert
  ).length;
  const activeDispatchesCount = dispatches.filter(
    (d) => d.status === "in-transit" || d.status === "loading"
  ).length;

  const superAdminNav = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "orders", label: "Branch Orders", icon: ClipboardList, badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined, badgeColor: "amber" },
    { id: "catalogue", label: "Product Catalogue", icon: Package },
    { id: "inventory", label: "Inventory", icon: Boxes, badge: lowStockCount > 0 ? `${lowStockCount} Low` : undefined, badgeColor: "rose" },
    { id: "dispatches", label: "Dispatch & Logistics", icon: Truck, badge: activeDispatchesCount > 0 ? activeDispatchesCount : undefined, badgeColor: "indigo" },
    { id: "branches", label: "Branch Directory", icon: Store },
    { id: "reports", label: "Reports & Analytics", icon: BarChart3 },
    { id: "users", label: "User Management", icon: Users }
  ];

  const branchAdminNav = [
    { id: "dashboard", label: "Branch Dashboard", icon: LayoutDashboard },
    { id: "order", label: "Weekly Stock Order", icon: ClipboardList },
    { id: "history", label: "Order History", icon: Store },
    { id: "receive", label: "Receive Shipment", icon: CheckSquare }
  ];

  const deliveryStaffNav = [
    { id: "dashboard", label: "Delivery Dashboard", icon: LayoutDashboard },
    { id: "dispatches", label: "Assigned Trips", icon: Truck },
    { id: "loading", label: "Loading Checklist", icon: CheckSquare },
    { id: "route", label: "Trip Route & Stops", icon: MapPin }
  ];

  let currentNavItems = superAdminNav;
  let rootHref = "/admin/super-admin";

  if (pathname.includes("/admin/branch")) {
    currentNavItems = branchAdminNav;
    rootHref = "/admin/branch";
  } else if (pathname.includes("/admin/delivery")) {
    currentNavItems = deliveryStaffNav;
    rootHref = "/admin/delivery";
  }

  const roleLabel =
    demoRole === "super-admin"
      ? "Super Admin (Varavoor)"
      : demoRole === "branch-admin"
      ? "Branch Admin (Franchise)"
      : "Delivery Staff (Logistics)";

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 border-b border-slate-800/80 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#D83162] text-white font-extrabold flex items-center justify-center text-sm shadow-sm">
              IS
            </div>
            <div>
              <div className="text-sm font-extrabold text-white tracking-tight leading-none flex items-center gap-1.5">
                Icespot Hub
                <span className="text-[10px] font-bold bg-[#D83162]/20 text-[#FF9EBB] px-1.5 py-0.5 rounded">
                  DEMO
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium">Varavoor Factory Operations</div>
            </div>
          </Link>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden text-slate-400 hover:text-white p-1 text-sm"
            >
              ✕
            </button>
          )}
        </div>

        {/* Current Active Role Pill */}
        <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800/80">
          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1 flex items-center justify-between">
            <span>Demo Mode Context</span>
            <Link
              href="/admin"
              className="text-[#FF9EBB] hover:underline flex items-center gap-1 text-[10px]"
            >
              <ArrowRightLeft className="w-3 h-3" /> Switch
            </Link>
          </div>
          <div className="text-xs font-semibold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            {roleLabel}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {currentNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  if (onTabChange) {
                    onTabChange(item.id);
                  }
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  isActive
                    ? "bg-[#D83162] text-white shadow-sm font-semibold"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      item.badgeColor === "rose"
                        ? "bg-rose-950 text-rose-300 border border-rose-800"
                        : item.badgeColor === "amber"
                        ? "bg-amber-950 text-amber-300 border border-amber-800"
                        : "bg-indigo-950 text-indigo-300 border border-indigo-800"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Switcher & Utility Box */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40 space-y-2">
          {/* Quick Role Toggle Bar */}
          <div className="bg-slate-800/80 rounded-xl p-1.5 flex items-center justify-between text-[11px]">
            <Link
              href="/admin/super-admin"
              className={`flex-1 text-center py-1 rounded-lg transition-colors font-medium ${
                pathname.includes("super-admin")
                  ? "bg-[#D83162] text-white font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Factory
            </Link>
            <Link
              href="/admin/branch"
              className={`flex-1 text-center py-1 rounded-lg transition-colors font-medium ${
                pathname.includes("branch")
                  ? "bg-[#D83162] text-white font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Branch
            </Link>
            <Link
              href="/admin/delivery"
              className={`flex-1 text-center py-1 rounded-lg transition-colors font-medium ${
                pathname.includes("delivery")
                  ? "bg-[#D83162] text-white font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Driver
            </Link>
          </div>

          <button
            onClick={() => {
              if (confirm("Reset demo data to initial sample values? Any uncommitted changes will revert.")) {
                resetDemoData();
              }
            }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Demo Data
          </button>

          <Link
            href="/"
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-slate-400 hover:text-[#FF9EBB] transition-colors border-t border-slate-800 pt-2"
          >
            <ExternalLink className="w-3 h-3" />
            Return to Public Website
          </Link>
        </div>
      </aside>
    </>
  );
}
