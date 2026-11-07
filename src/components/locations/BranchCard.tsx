import React from "react";
import Link from "next/link";
import { Branch } from "@/types";

interface BranchCardProps {
  branch: Branch;
}

export default function BranchCard({ branch }: BranchCardProps) {
  let badgeLabel = "Location Listing";
  let badgeClass = "status-candidate";

  if (branch.status === "factory") {
    badgeLabel = "Main Franchise";
    badgeClass = "status-factory";
  } else if (branch.status === "confirmed") {
    badgeLabel = "Verified Branch";
    badgeClass = "status-confirmed";
  }

  const isOpen = branch.isOpen ?? (branch.status !== "candidate");

  return (
    <div className={`branch-card ${!isOpen ? "branch-card-closed" : ""}`}>
      <div className="branch-card-header">
        <h4 className="branch-card-title">{branch.name}</h4>
        <div className="branch-header-badges">
          <span className={`branch-status-badge ${badgeClass}`}>{badgeLabel}</span>
          {isOpen ? (
            <span className="branch-op-badge op-open" title={`${branch.name} is currently open`}>
              <span className="branch-op-dot dot-open" />
              <span>OPEN</span>
            </span>
          ) : (
            <span className="branch-op-badge op-closed" title={`${branch.name} is currently closed`}>
              <span className="branch-op-dot dot-closed" />
              <span>CLOSED</span>
            </span>
          )}
        </div>
      </div>
      <p className="branch-card-location">{branch.location}</p>
      <div className="branch-card-footer">
        <span className="branch-region-tag">
          📍 {branch.district}
          {branch.subRegion ? ` • ${branch.subRegion === "coastal" ? "Coastal" : "Town"}` : ""}
        </span>
        <Link href={`/contact?branch=${encodeURIComponent(branch.name)}`} className="branch-link">
          View Details &rarr;
        </Link>
      </div>
    </div>
  );
}
