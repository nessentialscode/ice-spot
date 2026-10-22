"use client";

import React, { useState, useMemo } from "react";
import {
  Store,
  CheckCircle2,
  XCircle,
  Search,
  Power,
  MapPin,
  Clock,
  Filter,
  ShieldCheck,
  Building2
} from "lucide-react";
import { Branch } from "@/types";

interface BranchOperationsSectionProps {
  branches: (Branch & { isOpen: boolean })[];
  onToggleBranch: (branchId: string) => void;
  onSetAllBranches: (isOpen: boolean) => void;
}

type RegionFilter = "all" | "thrissur-town" | "thrissur-coastal" | "ernakulam" | "palakkad" | "malappuram";

export function BranchOperationsSection({
  branches,
  onToggleBranch,
  onSetAllBranches,
}: BranchOperationsSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<RegionFilter>("all");

  // Counters
  const openCount = useMemo(() => branches.filter((b) => b.isOpen).length, [branches]);
  const closedCount = branches.length - openCount;

  // Dynamic category counts based on actual branch dataset
  const categoryCounts = useMemo(() => ({
    all: branches.length,
    thrissurTown: branches.filter((b) => b.region === "thrissur" && b.subRegion === "town").length,
    thrissurCoastal: branches.filter((b) => b.region === "thrissur" && b.subRegion === "coastal").length,
    ernakulam: branches.filter((b) => b.region === "ernakulam" || b.district.toLowerCase() === "ernakulam").length,
    palakkad: branches.filter((b) => b.region === "palakkad" || b.district.toLowerCase() === "palakkad").length,
    malappuram: branches.filter((b) => b.region === "malappuram" || b.district.toLowerCase() === "malappuram").length,
  }), [branches]);

  // Filtered branches
  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      // 1. Region filter
      if (selectedFilter === "thrissur-town") {
        if (b.region !== "thrissur" || b.subRegion !== "town") return false;
      } else if (selectedFilter === "thrissur-coastal") {
        if (b.region !== "thrissur" || b.subRegion !== "coastal") return false;
      } else if (selectedFilter === "ernakulam") {
        if (b.region !== "ernakulam" && b.district.toLowerCase() !== "ernakulam") return false;
      } else if (selectedFilter === "palakkad") {
        if (b.region !== "palakkad" && b.district.toLowerCase() !== "palakkad") return false;
      } else if (selectedFilter === "malappuram") {
        if (b.region !== "malappuram" && b.district.toLowerCase() !== "malappuram") return false;
      }

      // 2. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          b.name.toLowerCase().includes(q) ||
          b.location.toLowerCase().includes(q) ||
          b.district.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [branches, selectedFilter, searchQuery]);

  return (
    <div className="bg-white rounded-[22px] border border-rose-100/90 shadow-[0_4px_24px_rgba(216,49,98,0.04)] p-6 sm:p-7">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-5 mb-5 border-b border-slate-100 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 text-[#E22F62] flex items-center justify-center flex-shrink-0 shadow-xs">
            <Building2 className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black tracking-wider uppercase text-slate-900">
                BRANCH NETWORK OPERATIONS &amp; OUTLET STATUS
              </h2>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                Central Control
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Super Admin authority to mark regional parlour branches Open or Closed across Kerala network
            </p>
          </div>
        </div>

        {/* Counters & Bulk Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Counter Badges */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl text-xs font-bold">
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {openCount} Open
            </span>
            <span className="text-slate-300">|</span>
            <span className="inline-flex items-center gap-1 text-rose-700">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              {closedCount} Closed
            </span>
          </div>

          {/* Bulk Action Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onSetAllBranches(true)}
              type="button"
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-[0.98]"
              title="Set all parlour branches to OPEN"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Mark All Open</span>
            </button>

            <button
              onClick={() => onSetAllBranches(false)}
              type="button"
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-[0.98]"
              title="Set all parlour branches to CLOSED"
            >
              <XCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>Mark All Closed</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search & Region Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Filter branch by name or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#D83162] text-xs font-medium placeholder:text-slate-400"
          />
        </div>

        {/* Region Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px] font-bold">
          <button
            onClick={() => setSelectedFilter("all")}
            className={`px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap cursor-pointer ${
              selectedFilter === "all"
                ? "bg-[#0F172A] text-white border-transparent shadow-xs"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            All Outlets ({categoryCounts.all})
          </button>
          <button
            onClick={() => setSelectedFilter("thrissur-town")}
            className={`px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap cursor-pointer ${
              selectedFilter === "thrissur-town"
                ? "bg-[#0F172A] text-white border-transparent shadow-xs"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Thrissur Town ({categoryCounts.thrissurTown})
          </button>
          <button
            onClick={() => setSelectedFilter("thrissur-coastal")}
            className={`px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap cursor-pointer ${
              selectedFilter === "thrissur-coastal"
                ? "bg-[#0F172A] text-white border-transparent shadow-xs"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Thrissur Coastal ({categoryCounts.thrissurCoastal})
          </button>
          <button
            onClick={() => setSelectedFilter("ernakulam")}
            className={`px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap cursor-pointer ${
              selectedFilter === "ernakulam"
                ? "bg-[#0F172A] text-white border-transparent shadow-xs"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Ernakulam ({categoryCounts.ernakulam})
          </button>
          <button
            onClick={() => setSelectedFilter("palakkad")}
            className={`px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap cursor-pointer ${
              selectedFilter === "palakkad"
                ? "bg-[#0F172A] text-white border-transparent shadow-xs"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Palakkad ({categoryCounts.palakkad})
          </button>
          <button
            onClick={() => setSelectedFilter("malappuram")}
            className={`px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap cursor-pointer ${
              selectedFilter === "malappuram"
                ? "bg-[#0F172A] text-white border-transparent shadow-xs"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Malappuram ({categoryCounts.malappuram})
          </button>
        </div>
      </div>

      {/* 2-Column Responsive Grid of Branch Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredBranches.map((branch) => {
          const isOpen = branch.isOpen;

          return (
            <div
              key={branch.id}
              className={`border rounded-2xl p-4 sm:p-5 transition-all flex flex-col justify-between gap-4 ${
                isOpen
                  ? "bg-white border-slate-200/90 hover:border-emerald-200 shadow-2xs hover:shadow-xs"
                  : "bg-slate-50/80 border-slate-200/60 opacity-90"
              }`}
            >
              <div>
                {/* Branch Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {branch.name}
                      </h3>
                      {branch.isFactoryHeadquarters && (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-rose-100 text-[#BD1F49] border border-rose-200 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          HQ Factory
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-rose-500" />
                        {branch.subRegion === "town" && "Thrissur • Town Outlets"}
                        {branch.subRegion === "coastal" && "Thrissur • Coastal Zone"}
                        {!branch.subRegion && `${branch.district} District`}
                      </span>
                      {branch.timing && (
                        <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {branch.timing}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status Pill */}
                  <div className="flex-shrink-0">
                    {isOpen ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>OPEN</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-rose-50 text-rose-800 border border-rose-200">
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        <span>CLOSED</span>
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-500 font-normal mt-2 line-clamp-1">
                  {branch.location}
                </p>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100/90">
                <span className="text-[11px] font-semibold text-slate-400">
                  {isOpen ? "Currently serving customers" : "Parlour marked temporarily closed"}
                </span>

                <button
                  type="button"
                  onClick={() => onToggleBranch(branch.id)}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98] ${
                    isOpen
                      ? "bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 hover:border-rose-300 shadow-2xs"
                      : "bg-[#0F172A] hover:bg-[#1E293B] text-white shadow-xs"
                  }`}
                >
                  <Power className={`w-3.5 h-3.5 ${isOpen ? "text-rose-600" : "text-emerald-400"}`} />
                  <span>{isOpen ? "Mark Closed" : "Mark Open"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredBranches.length === 0 && (
        <div className="py-12 text-center text-slate-400 text-xs font-medium">
          No branches found matching "{searchQuery}".
        </div>
      )}
    </div>
  );
}
