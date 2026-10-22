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

  return (
    <div className="branch-card">
      <div className="branch-card-header">
        <h4 className="branch-card-title">{branch.name}</h4>
        <span className={`branch-status-badge ${badgeClass}`}>{badgeLabel}</span>
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
