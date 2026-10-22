"use client";

import React, { useState, useMemo } from "react";
import { BRANCHES } from "@/lib/data/branches";
import { Region } from "@/types";
import BranchCard from "./BranchCard";

interface BranchDirectoryProps {
  showIntro?: boolean;
}

const DESKTOP_FILTERS = [
  { label: "All Regions", value: "all" },
  { label: "All Thrissur", value: "thrissur" },
  { label: "Thrissur Town", value: "thrissur-town" },
  { label: "Thrissur Coastal", value: "thrissur-coastal" },
  { label: "Ernakulam", value: "ernakulam" },
  { label: "Palakkad", value: "palakkad" },
  { label: "Malappuram", value: "malappuram" },
  { label: "Other Locations", value: "other" },
] as const;

interface MobileCategoryConfig {
  id: string;
  label: string;
  districtName: string;
  icon: string;
  match: (branch: (typeof BRANCHES)[number]) => boolean;
}

const MOBILE_CATEGORIES: MobileCategoryConfig[] = [
  {
    id: "thrissur-town",
    label: "Thrissur Town",
    districtName: "Central City, Swaraj Round & Inland Outlets",
    icon: "🏙️",
    match: (b) => b.region === "thrissur" && b.subRegion === "town",
  },
  {
    id: "thrissur-coastal",
    label: "Thrissur Coastal",
    districtName: "Vadanappally, Triprayar & Beach Corridor",
    icon: "🌊",
    match: (b) => b.region === "thrissur" && b.subRegion === "coastal",
  },
  {
    id: "ernakulam",
    label: "Ernakulam",
    districtName: "Ernakulam District & Cochin Metro",
    icon: "📍",
    match: (b) => b.region === "ernakulam" || b.district.toLowerCase() === "ernakulam",
  },
  {
    id: "palakkad",
    label: "Palakkad",
    districtName: "Palakkad District Regional Outlet",
    icon: "📍",
    match: (b) => b.region === "palakkad" || b.district.toLowerCase() === "palakkad",
  },
  {
    id: "malappuram",
    label: "Malappuram",
    districtName: "Malappuram District Regional Outlet",
    icon: "📍",
    match: (b) => b.region === "malappuram" || b.district.toLowerCase() === "malappuram",
  },
  {
    id: "other",
    label: "Other Locations",
    districtName: "Regional Kerala Network",
    icon: "📍",
    match: (b) => b.region === "other",
  },
];

export default function BranchDirectory({ showIntro = true }: BranchDirectoryProps) {
  const [selectedRegion, setSelectedRegion] = useState<Region>("all");
  const [selectedMobileCategory, setSelectedMobileCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const trimmedQuery = searchQuery.toLowerCase().trim();

  const matchesSearch = (branch: (typeof BRANCHES)[number]) => {
    if (!trimmedQuery) return true;
    return (
      branch.name.toLowerCase().includes(trimmedQuery) ||
      branch.location.toLowerCase().includes(trimmedQuery) ||
      branch.district.toLowerCase().includes(trimmedQuery) ||
      (branch.subRegion && branch.subRegion.toLowerCase().includes(trimmedQuery))
    );
  };

  // Desktop filtered branches
  const desktopFilteredBranches = useMemo(() => {
    return BRANCHES.filter((branch) => {
      let matchesRegion = true;
      if (selectedRegion === "all") {
        matchesRegion = true;
      } else if (selectedRegion === "thrissur") {
        matchesRegion = branch.region === "thrissur";
      } else if (selectedRegion === "thrissur-town") {
        matchesRegion = branch.region === "thrissur" && branch.subRegion === "town";
      } else if (selectedRegion === "thrissur-coastal") {
        matchesRegion = branch.region === "thrissur" && branch.subRegion === "coastal";
      } else {
        matchesRegion = branch.region === selectedRegion;
      }

      return matchesRegion && matchesSearch(branch);
    });
  }, [selectedRegion, trimmedQuery]);

  // Mobile grouped branches by category (Thrissur Town, Thrissur Coastal, Ernakulam, Palakkad, Other)
  const mobileCategoryGroups = useMemo(() => {
    return MOBILE_CATEGORIES.map((category) => {
      const branches = BRANCHES.filter((branch) => {
        return category.match(branch) && matchesSearch(branch);
      });

      return {
        ...category,
        branches,
      };
    });
  }, [trimmedQuery]);

  // Filtered categories according to selected mobile chip
  const displayedMobileGroups = useMemo(() => {
    if (selectedMobileCategory === "all") {
      return mobileCategoryGroups;
    }
    return mobileCategoryGroups.filter((g) => g.id === selectedMobileCategory);
  }, [mobileCategoryGroups, selectedMobileCategory]);

  const mobileTotalMatches = useMemo(() => {
    return mobileCategoryGroups.reduce((sum, group) => sum + group.branches.length, 0);
  }, [mobileCategoryGroups]);

  return (
    <section className="branches-section" id="branches">
      <div className="branches-container">
        {showIntro && (
          <div className="section-intro">
            <span className="section-tag">Find Us</span>
            <h2 className="section-title">Find an Icespot Near You</h2>
            <p className="section-subtitle">
              Discover our main Varavoor production factory and explore regional franchise branches across Kerala.
            </p>
          </div>
        )}

        {/* Main Franchise Varavoor Factory Feature Card */}
        <div className="flagship-branch-card">
          <div className="flagship-info">
            <span className="flagship-badge">★ MAIN FRANCHISE &amp; FACTORY HEADQUARTERS</span>
            <h3>Ice Spot Varavoor Factory</h3>
            <p className="flagship-address">
              Main Manufacturing Factory &amp; Central Franchise Hub, Varavoor, Wadakkanchery, Thrissur, Kerala 680585, India.
            </p>
            <div className="flagship-highlights">
              <span className="flagship-tag">🏭 Main Production Hub</span>
              <span className="flagship-tag">🍨 Pure Cream &amp; 10 Real Fruit Sticks</span>
              <span className="flagship-tag">✨ Central Franchise Operations</span>
            </div>
          </div>
          <div>
            <a
              href="https://maps.google.com/?q=Varavoor+Thrissur+Kerala"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-directions"
            >
              Get Directions ↗
            </a>
          </div>
        </div>

        {/* =========================================================================
            DESKTOP LAYOUT (Full grid with All Regions, Thrissur Town, Thrissur Coastal filters)
           ========================================================================= */}
        <div className="hidden md:block">
          {/* Desktop Filter Controls & Search */}
          <div className="branch-controls">
            <div className="branch-filter-group" role="tablist" aria-label="Filter branches by region">
              {DESKTOP_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  className={`branch-filter-btn ${selectedRegion === filter.value ? "active" : ""}`}
                  data-region={filter.value}
                  onClick={() => setSelectedRegion(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div>
              <input
                type="text"
                className="branch-search-input"
                id="branchSearchDesktop"
                placeholder="🔍 Search town, area, or code..."
                aria-label="Search branch location"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Desktop Branch Cards Grid */}
          <div className="branches-grid" id="branchesGridDesktop">
            {desktopFilteredBranches.length > 0 ? (
              desktopFilteredBranches.map((branch) => (
                <BranchCard key={branch.id} branch={branch} />
              ))
            ) : (
              <div
                style={{
                  gridColumn: "1 / -1",
                  textAlign: "center",
                  padding: "40px",
                  color: "var(--color-text-muted)",
                }}
              >
                No matching branch locations found. You can visit our confirmed flagship factory at{" "}
                <strong>Varavoor, Thrissur</strong>!
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            MOBILE LAYOUT (Categorised into Thrissur Town, Thrissur Coastal, etc. with horizontal swipe)
           ========================================================================= */}
        <div className="block md:hidden mt-6">
          {/* Mobile Search Bar */}
          <div className="mb-4">
            <input
              type="text"
              className="branch-search-input w-full"
              id="branchSearchMobile"
              placeholder="🔍 Search town, coastal, area, or code..."
              aria-label="Search branch location on mobile"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Quick Mobile Category Filter Chips */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none -mx-1 px-1">
            <button
              id="mobile-cat-chip-all"
              data-category="all"
              onClick={() => setSelectedMobileCategory("all")}
              className={`whitespace-nowrap px-3.5 py-1.5 text-xs font-bold rounded-full transition-all ${
                selectedMobileCategory === "all"
                  ? "bg-[#6D0C27] text-white shadow-sm"
                  : "bg-white text-slate-700 border border-slate-200"
              }`}
            >
              All Regions ({mobileTotalMatches})
            </button>
            {mobileCategoryGroups.map((cat) => (
              <button
                key={cat.id}
                id={`mobile-cat-chip-${cat.id}`}
                data-category={cat.id}
                onClick={() => setSelectedMobileCategory(cat.id)}
                className={`whitespace-nowrap px-3.5 py-1.5 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 ${
                  selectedMobileCategory === cat.id
                    ? "bg-[#6D0C27] text-white shadow-sm"
                    : "bg-white text-slate-700 border border-slate-200"
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    selectedMobileCategory === cat.id
                      ? "bg-white/20 text-white"
                      : "bg-[#FDE8ED] text-[#D83162]"
                  }`}
                >
                  {cat.branches.length}
                </span>
              </button>
            ))}
          </div>

          {/* Mobile Horizontal Scrolling Rows by Category */}
          {mobileTotalMatches > 0 ? (
            <div className="space-y-8">
              {displayedMobileGroups.map((group) => {
                if (group.branches.length === 0) return null;

                return (
                  <div key={group.id} className="mobile-branch-category">
                    {/* Category Header */}
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div>
                        <h3 className="text-base font-extrabold text-[#6D0C27] tracking-tight flex items-center gap-2">
                          <span>{group.icon}</span>
                          <span>{group.label}</span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FDE8ED] text-[#D83162] border border-[#D83162]/20">
                            {group.branches.length} {group.branches.length === 1 ? "Outlet" : "Outlets"}
                          </span>
                        </h3>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                          {group.districtName}
                        </p>
                      </div>

                      {group.branches.length > 1 && (
                        <span className="text-[11px] font-bold text-[#D83162] tracking-wide flex items-center gap-1 select-none">
                          Swipe &rarr;
                        </span>
                      )}
                    </div>

                    {/* Horizontal Scrolling Row of Branch Cards */}
                    <div className="mobile-branches-scroll-row">
                      {group.branches.map((branch) => (
                        <div key={branch.id} className="mobile-branch-slide">
                          <BranchCard branch={branch} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-500 text-xs">
              No matching branch locations found for &ldquo;<strong>{searchQuery}</strong>&rdquo;. You can visit our confirmed flagship factory at <strong>Varavoor, Thrissur</strong>!
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
