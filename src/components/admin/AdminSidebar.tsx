"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAdmin } from "@/context/AdminContext";
import {
  LayoutDashboard,
  ClipboardList,
  Boxes,
  Truck,
  Store,
  MapPin,
  ExternalLink,
  RotateCcw,
  X
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: string | number;
  badgeColor?: "rose" | "amber" | "sky" | "slate" | "indigo";
}

interface AdminSidebarProps {
  currentSection?: string;
  onSectionChange?: (section: string) => void;
  sections?: NavItem[];
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  roleBadgeText?: string;
  roleBadgeColor?: "rose" | "amber" | "sky";
  userEmail?: string;
  // Legacy compatibility props
  currentTab?: string;
  onTabChange?: (tab: string) => void;
  userRole?: string;
}

export function AdminSidebar({
  currentSection,
  onSectionChange,
  sections,
  isMobileOpen = false,
  onCloseMobile,
  roleBadgeText,
  roleBadgeColor = "rose",
  userEmail,
  currentTab,
  onTabChange,
  userRole,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const { demoRole, orders, products, dispatches, resetDemoData } = useAdmin();

  // Determine active section (supports new currentSection or legacy currentTab)
  const activeSectionId = currentSection || currentTab;

  // Real-time badge counts
  const pendingOrdersCount = orders.filter(
    (o) => o.status === "submitted" || o.status === "under-review"
  ).length;
  const lowStockCount = products.filter(
    (p) => p.currentStock <= p.minStockAlert
  ).length;
  const activeDispatchesCount = dispatches.filter(
    (d) => d.status === "in-transit" || d.status === "loading"
  ).length;

  // 1. EXACT SUPER ADMIN SECTIONS
  const superAdminNav: NavItem[] = [
    { id: "DASHBOARD", label: "DASHBOARD", icon: LayoutDashboard },
    { id: "BRANCH NETWORK", label: "BRANCH NETWORK", icon: Store },
    {
      id: "BRANCH ORDERS",
      label: "BRANCH ORDERS",
      icon: ClipboardList,
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined,
      badgeColor: "amber",
    },
    {
      id: "FACTORY INVENTORY",
      label: "FACTORY INVENTORY",
      icon: Boxes,
      badge: lowStockCount > 0 ? `${lowStockCount} Low` : undefined,
      badgeColor: "rose",
    },
    {
      id: "VEHICLE STATUS",
      label: "VEHICLE STATUS",
      icon: Truck,
      badge: activeDispatchesCount > 0 ? activeDispatchesCount : undefined,
      badgeColor: "sky",
    },
  ];

  // 2. EXACT BRANCH ADMIN SECTIONS
  const branchAdminNav: NavItem[] = [
    { id: "DASHBOARD", label: "DASHBOARD", icon: LayoutDashboard },
    { id: "WEEKLY STOCK ORDER", label: "WEEKLY STOCK ORDER", icon: ClipboardList },
    { id: "INCOMING FACTORY DELIVERY", label: "INCOMING FACTORY DELIVERY", icon: Truck },
  ];

  // 3. EXACT STAFF ADMIN SECTIONS
  const staffAdminNav: NavItem[] = [
    { id: "VEHICLE DISPATCH & TRIP SETUP", label: "VEHICLE DISPATCH & TRIP SETUP", icon: Truck },
    { id: "BRANCHES & ROUTE STOP", label: "BRANCHES & ROUTE STOP", icon: MapPin },
    { id: "ORDERED STOCK", label: "ORDERED STOCK", icon: Boxes },
    {
      id: "INCOMING BRANCH ORDERS",
      label: "INCOMING BRANCH ORDERS",
      icon: ClipboardList,
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined,
      badgeColor: "amber",
    },
  ];

  // Pick navigation items
  let navItems = sections;
  if (!navItems || navItems.length === 0) {
    if (pathname?.includes("/admin/branch") || roleBadgeText?.toUpperCase().includes("BRANCH")) {
      navItems = branchAdminNav;
    } else if (
      pathname?.includes("/admin/delivery") ||
      roleBadgeText?.toUpperCase().includes("STAFF") ||
      roleBadgeText?.toUpperCase().includes("DELIVERY")
    ) {
      navItems = staffAdminNav;
    } else {
      navItems = superAdminNav;
    }
  }

  // Active role text
  const currentRoleBadge =
    roleBadgeText ||
    (pathname?.includes("/admin/branch")
      ? "BRANCH ADMIN"
      : pathname?.includes("/admin/delivery")
      ? "STAFF ADMIN"
      : "SUPER ADMIN");

  const portalHomeHref = pathname?.includes("/admin/branch")
    ? "/admin/branch"
    : pathname?.includes("/admin/delivery")
    ? "/admin/delivery"
    : "/admin/super-admin";

  const handleItemClick = (id: string) => {
    if (typeof onSectionChange === "function") {
      onSectionChange(id);
    }
    if (typeof onTabChange === "function") {
      onTabChange(id);
    }
    if (typeof onCloseMobile === "function") {
      onCloseMobile();
    }
  };

  const badgeColorClasses: Record<string, string> = {
    rose: "bg-rose-950/80 text-rose-300 border border-rose-800/80",
    amber: "bg-amber-950/80 text-amber-300 border border-amber-800/80",
    sky: "bg-sky-950/80 text-sky-300 border border-sky-800/80",
    indigo: "bg-indigo-950/80 text-indigo-300 border border-indigo-800/80",
    slate: "bg-slate-800 text-slate-300 border border-slate-700",
  };

  const sidebarContent = (
    <div className="flex flex-col h-full w-[260px] bg-[#0F172A] text-slate-300 border-r border-slate-800/90 select-none">
      {/* Brand Header */}
      <div className="h-16 px-4 border-b border-slate-800/90 flex items-center justify-between flex-shrink-0 bg-slate-950/40">
        <Link href={portalHomeHref} className="flex items-center hover:opacity-90 transition-opacity">
          <Image
            src="/assets/icespot-brand-logo.png"
            alt="IceSpot - Live in Freshness"
            width={140}
            height={48}
            priority
            className="h-10 w-auto object-contain"
          />
        </Link>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            type="button"
            className="lg:hidden text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/80 transition-colors"
            title="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Role Pill Header */}
      <div className="px-4 py-2.5 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0"></span>
          <span className="text-[11px] font-black uppercase tracking-wider text-white truncate">
            {currentRoleBadge}
          </span>
        </div>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-800/90 px-1.5 py-0.5 rounded">
          PORTAL
        </span>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 px-2.5 py-3.5 space-y-1 overflow-y-auto">
        <div className="px-2 pb-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
          Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSectionId === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleItemClick(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                isActive
                  ? "bg-[#BD1F49] text-white shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/70"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {Icon && (typeof Icon === "function" || typeof Icon === "object") ? (
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 ${
                      isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200"
                    }`}
                  />
                ) : null}
                <span className="truncate text-[11px] font-extrabold">{item.label}</span>
              </div>

              {item.badge !== undefined && (
                <span
                  className={`text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    item.badgeColor && badgeColorClasses[item.badgeColor]
                      ? badgeColorClasses[item.badgeColor]
                      : "bg-slate-800 text-slate-300 border border-slate-700"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sidebar Bottom Utility */}
      <div className="p-3 border-t border-slate-800/90 bg-slate-950/60 space-y-1.5 flex-shrink-0">
        <Link
          href="/"
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-[11px] font-bold text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors border border-slate-800"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Public Website</span>
        </Link>

        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && localStorage.getItem("icespot_auth_email")) {
              alert("Active database session: Resetting demo data is disabled.");
              return;
            }
            if (confirm("Reset demo data to initial sample values? Any uncommitted changes will revert.")) {
              resetDemoData();
            }
          }}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-medium text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset Demo Data</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Expanded Sidebar (Fixed at 260px) */}
      <aside className="hidden lg:flex fixed top-0 bottom-0 left-0 z-40 w-[260px]">
        {sidebarContent}
      </aside>

      {/* Mobile Backdrop & Drawer */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-[260px] lg:hidden transition-transform duration-300 ease-in-out ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
