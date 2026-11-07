"use client";

import React, { ReactNode, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useAdmin } from "@/context/AdminContext";
import { createClient } from "@/lib/supabase/client";
import {
  RotateCcw,
  ExternalLink,
  LogOut,
  Menu
} from "lucide-react";
import { AdminSidebar, NavItem } from "./AdminSidebar";
import { signOutAction } from "@/lib/actions/auth";

interface AdminShellProps {
  title?: string;
  subtitle?: string;
  roleBadgeText?: string;
  roleBadgeColor?: "rose" | "amber" | "sky";
  userEmail?: string;
  children: ReactNode;
  // Navigation / section props
  activeSection?: string;
  onSectionChange?: (section: string) => void;
  sections?: NavItem[];
  // Legacy optional props to prevent type breaks
  currentTab?: string;
  onTabChange?: (tab: string) => void;
}

export function AdminShell({
  title = "Youback Icespot Factory",
  subtitle = "Varavoor Central Production & Operations Portal",
  roleBadgeText,
  roleBadgeColor = "rose",
  userEmail,
  children,
  activeSection,
  onSectionChange,
  sections,
  currentTab,
  onTabChange,
}: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { resetDemoData, showToast } = useAdmin();
  const [isExiting, setIsExiting] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Link logo to current portal home rather than unauthenticated login page
  const portalHomeHref = pathname?.includes("/admin/branch")
    ? "/admin/branch"
    : pathname?.includes("/admin/delivery")
    ? "/admin/delivery"
    : "/admin/super-admin";

  // Role badge strictly uses verified roleBadgeText or safe fallback
  const activeRoleBadge = roleBadgeText || "PORTAL STAFF";

  const badgeColorClasses =
    roleBadgeColor === "amber"
      ? "bg-amber-100 text-amber-900 border border-amber-200"
      : roleBadgeColor === "sky"
      ? "bg-sky-100 text-sky-900 border border-sky-200"
      : "bg-rose-100 text-[#BD1F49] border border-rose-200";

  // Shared header displays only verified authenticated user email; never invents fallback identities
  const activeEmail = userEmail || "Authenticating...";

  const handleRefresh = () => {
    if (userEmail) {
      router.refresh();
      showToast("Operational portal view refreshed", "info");
      return;
    }
    resetDemoData();
    showToast("Portal operational data refreshed", "info");
  };

  const handleExitPortal = async () => {
    if (isExiting) return;
    setIsExiting(true);

    try {
      // 1. Invalidate session on server and clear response cookies
      const serverResult = await signOutAction();
      if (!serverResult.success) {
        showToast(serverResult.error || "Session invalidation failed. Please try again.", "error");
        setIsExiting(false);
        return;
      }

      // 2. Clear client-side Supabase instance
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch {
        // ignore client library error if server already signed out
      }

      // 3. Clear only application-specific transient UI state that is safe to clear
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem("icespot_auth_email");
          localStorage.removeItem("icespot_active_dispatch_id");
        } catch {
          // ignore
        }
      }

      // 4. Hard navigation to /admin to ensure clean state tree
      window.location.href = "/admin";
    } catch (err: any) {
      showToast("Exit portal failed: " + (err?.message || "Network error"), "error");
      setIsExiting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans antialiased selection:bg-rose-100 selection:text-[#BD1F49] max-w-full overflow-x-hidden">
      {/* Persistent Left Sidebar Component (Desktop 260px fixed + Mobile Drawer) */}
      <AdminSidebar
        currentSection={activeSection || currentTab}
        onSectionChange={onSectionChange || onTabChange}
        sections={sections}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        roleBadgeText={roleBadgeText}
        roleBadgeColor={roleBadgeColor}
        userEmail={userEmail}
      />

      {/* Main Container Offset by Left Sidebar (260px on desktop) */}
      <div className="lg:pl-[260px] flex-1 flex flex-col min-w-0 w-full">
        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 shadow-xs w-full max-w-full">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4 w-full min-w-0">
            {/* Left: Mobile Menu Toggle + Brand Logo + Title + Role Badge */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer flex-shrink-0"
                title="Open navigation menu"
                aria-label="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <Link href={portalHomeHref} className="flex-shrink-0 hover:opacity-90 transition-opacity lg:hidden">
                <Image
                  src="/assets/icespot-brand-logo.png"
                  alt="YouBack Icespot"
                  width={100}
                  height={48}
                  priority
                  className="h-7 w-auto object-contain"
                />
              </Link>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <span className="text-xs sm:text-base font-black text-slate-900 tracking-tight leading-tight truncate max-w-[130px] sm:max-w-none">
                    {title}
                  </span>
                  <span
                    className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${badgeColorClasses}`}
                  >
                    {activeRoleBadge}
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate mt-0.5 hidden xs:block sm:block">
                  {subtitle}
                </p>
              </div>
            </div>

            {/* Right: User Email Pill + Refresh + Public Website + Exit Portal Action */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
              {/* User Email Chip */}
              <div className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
                {activeEmail}
              </div>

              {/* Refresh Action */}
              <button
                onClick={handleRefresh}
                type="button"
                className="p-1.5 sm:p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 transition-colors cursor-pointer"
                title="Refresh operational data"
              >
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              {/* Public Website Button */}
              <Link
                href="/"
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-200 bg-sky-50/50 hover:bg-sky-50 text-sky-800 text-xs font-bold transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-sky-600" />
                <span>Public Website</span>
              </Link>

              {/* Exit Portal Action */}
              <button
                onClick={handleExitPortal}
                disabled={isExiting}
                type="button"
                title="Terminate session and exit admin portal"
                className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-[#BD1F49] text-xs font-bold transition-all cursor-pointer shadow-xs whitespace-nowrap disabled:opacity-60"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{isExiting ? "Exiting..." : "Exit Portal"}</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Workspace Body */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-7 space-y-6 max-w-full overflow-x-hidden">
          {children}
        </main>

        {/* Enterprise Footer */}
        <footer className="border-t border-slate-200/80 bg-white/70 py-4 px-6 text-center text-xs text-slate-400 font-medium">
          &copy; 2026 Youback Icespot Factory &bull; Varavoor, Thrissur, Kerala
        </footer>
      </div>
    </div>
  );
}
