"use client";

import React, { useState, useMemo } from "react";
import { BRANCHES } from "@/lib/data/branches";
import { Region } from "@/types";
import BranchCard from "./BranchCard";

interface BranchDirectoryProps {
  showIntro?: boolean;
}

const REGION_CATEGORIES = [
  { label: "Thrissur", value: "thrissur", districtName: "Thrissur District (Headquarters & Parlours)" },
  { label: "Ernakulam", value: "ernakulam", districtName: "Ernakulam District & Cochin Metro" },
  { label: "Palakkad", value: "palakkad", districtName: "Palakkad District Regional Outlet" },
  { label: "Other Locations", value: "other", districtName: "Malappuram & Regional Network" },
] as const;

export default function BranchDirectory({ showIntro = true }: BranchDirectoryProps) {
  const [selectedRegion, setSelectedRegion] = useState<Region>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const trimmedQuery = searchQuery.toLowerCase().trim();

  // Desktop filtered branches
  const desktopFilteredBranches = useMemo(() => {
    return BRANCHES.filter((branch) => {
      const matchesRegion = selectedRegion === "all" || branch.region === selectedRegion;
      const matchesSearch =
        !trimmedQuery ||
        branch.name.toLowerCase().includes(trimmedQuery) ||
        branch.location.toLowerCase().includes(trimmedQuery) ||
        branch.district.toLowerCase().includes(trimmedQuery);
      return matchesRegion && matchesSearch;
    });
  }, [selectedRegion, trimmedQuery]);

  // Mobile grouped branches by category
  const mobileCategoryGroups = useMemo(() => {
    return REGION_CATEGORIES.map((category) => {
      const branches = BRANCHES.filter((branch) => {
        const matchesCategory = branch.region === category.value;
        const matchesSearch =
          !trimmedQuery ||
          branch.name.toLowerCase().includes(trimmedQuery) ||
          branch.location.toLowerCase().includes(trimmedQuery) ||
          branch.district.toLowerCase().includes(trimmedQuery);
        return matchesCategory && matchesSearch;
      });

      return {
        ...category,
        branches
      };
    });
  }, [trimmedQuery]);

  const mobileTotalMatches = mobileCategoryGroups.reduce(
    (sum, group) => sum + group.branches.length,
    0
  );

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
            DESKTOP LAYOUT (Unchanged desktop view with filters, search, and grid)
           ========================================================================= */}
        <div className="hidden md:block">
          {/* Desktop Filter Controls & Search */}
          <div className="branch-controls">
            <div className="branch-filter-group" role="tablist" aria-label="Filter branches by region">
              {(
                [
                  { label: "All Regions", value: "all" },
                  { label: "Thrissur", value: "thrissur" },
                  { label: "Ernakulam", value: "ernakulam" },
                  { label: "Palakkad", value: "palakkad" },
                  { label: "Other Locations", value: "other" },
                ] as const
              ).map((filter) => (
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
            MOBILE LAYOUT (Each category has its own horizontal scrolling row)
           ========================================================================= */}
        <div className="block md:hidden mt-6">
          {/* Mobile Search Bar */}
          <div className="mb-6">
            <input
              type="text"
              className="branch-search-input w-full"
              id="branchSearchMobile"
              placeholder="🔍 Search town, area, or code..."
              aria-label="Search branch location on mobile"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Mobile Horizontal Scrolling Rows by Category */}
          {mobileTotalMatches > 0 ? (
            <div className="space-y-8">
              {mobileCategoryGroups.map((group) => {
                if (group.branches.length === 0) return null;

                return (
                  <div key={group.value} className="mobile-branch-category">
                    {/* Category Header */}
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div>
                        <h3 className="text-base font-extrabold text-[#6D0C27] tracking-tight flex items-center gap-2">
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
