"use client";

import React, { ReactNode, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAdmin } from "@/context/AdminContext";
import { createClient } from "@/lib/supabase/client";
import {
  RotateCcw,
  ExternalLink,
  LogOut
} from "lucide-react";

interface AdminShellProps {
  title?: string;
  subtitle?: string;
  roleBadgeText?: string;
  roleBadgeColor?: "rose" | "amber" | "sky";
  userEmail?: string;
  children: ReactNode;
  // Legacy optional props to prevent type breaks
  currentTab?: string;
  onTabChange?: (tab: string) => void;
}

export function AdminShell({
  title = "Youback Icespot Factory",
  subtitle = "Order Management & Logistics Portal",
  roleBadgeText,
  roleBadgeColor = "rose",
  userEmail,
  children
}: AdminShellProps) {
  const router = useRouter();
  const { demoRole, resetDemoData, showToast } = useAdmin();
  const [storedEmail, setStoredEmail] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("icespot_auth_email");
        if (saved) setStoredEmail(saved);
      } catch {
        // ignore
      }
    }
  }, []);

  // Determine badge text and color based on demoRole if not explicitly passed
  const activeRoleBadge =
    roleBadgeText ||
    (demoRole === "super-admin"
      ? "SUPER ADMIN"
      : demoRole === "branch-admin"
      ? "BRANCH ADMIN"
      : "STAFF ADMIN");

  const badgeColorClasses =
    roleBadgeColor === "amber" || demoRole === "branch-admin"
      ? "bg-amber-100 text-amber-900 border border-amber-200"
      : roleBadgeColor === "sky" || demoRole === "delivery-staff"
      ? "bg-sky-100 text-sky-900 border border-sky-200"
      : "bg-rose-100 text-[#BD1F49] border border-rose-200";

  const activeEmail =
    storedEmail ||
    userEmail ||
    (demoRole === "super-admin"
      ? "admin@icespot.com"
      : demoRole === "branch-admin"
      ? "ollur@icespot.com"
      : "staff@icespot.com");

  const handleRefresh = () => {
    resetDemoData();
    showToast("Portal operational data refreshed", "info");
  };

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("icespot_auth_email");
      } catch {
        // ignore
      }
    }
    router.push("/admin");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-[#FFF7F9] text-slate-800 flex flex-col font-sans antialiased selection:bg-rose-100 selection:text-[#BD1F49]">
      {/* Top Navigation Bar - Matched with Reference Image */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-rose-100/90 px-4 sm:px-8 py-3.5 shadow-[0_2px_12px_rgba(216,49,98,0.03)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Left: Brand Squircle Emblem + Title + Role Badge + Subtitle */}
          <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-[#E22F62] to-[#BD1F49] shadow-sm shadow-[#E22F62]/20 flex items-center justify-center p-2 flex-shrink-0">
              <Image
                src="/assets/icespot-logo-new.png"
                alt="Icespot"
                width={36}
                height={20}
                priority
                className="w-full h-auto object-contain brightness-0 invert"
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-tight">
                  {title}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${badgeColorClasses}`}
                >
                  {activeRoleBadge}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                {subtitle}
              </p>
            </div>
          </div>

          {/* Right: User Email Pill + Refresh + Public Website + Sign Out */}
          <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
            {/* User Email Chip */}
            <div className="hidden lg:inline-flex items-center px-3 py-1.5 rounded-xl bg-slate-100/90 text-slate-700 text-xs font-semibold border border-slate-200/70">
              {activeEmail}
            </div>

            {/* Refresh Action */}
            <button
              onClick={handleRefresh}
              type="button"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
              title="Refresh / Reset Prototype Data"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Public Website Button */}
            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-200 bg-sky-50/50 hover:bg-sky-50 text-sky-800 text-xs font-bold transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-sky-600" />
              <span>Public Website</span>
            </Link>

            {/* Sign Out Button */}
            <button
              onClick={handleSignOut}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-[#BD1F49] text-xs font-bold transition-colors cursor-pointer shadow-xs"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Portal Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {children}
      </main>

      {/* Clean Down End Footer */}
      <footer className="border-t border-rose-100/70 bg-white/70 py-4 px-6 text-center text-xs text-slate-400 font-medium">
        &copy; 2026 Youback Icespot Factory &bull; Varavoor, Thrissur, Kerala
      </footer>
    </div>
  );
}
