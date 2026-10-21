import React, { ReactNode } from "react";

interface SummaryCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  badge?: string;
  badgeColor?: "emerald" | "amber" | "rose" | "indigo" | "slate";
  accentColor?: "rose" | "amber" | "emerald" | "indigo" | "slate";
  onClick?: () => void;
}

export function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  badge,
  badgeColor = "slate",
  accentColor = "rose",
  onClick
}: SummaryCardProps) {
  const accentClasses = {
    rose: "text-[#D83162] bg-rose-50 border-rose-100",
    amber: "text-amber-600 bg-amber-50 border-amber-100",
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-100",
    indigo: "text-indigo-600 bg-indigo-50 border-indigo-100",
    slate: "text-slate-600 bg-slate-50 border-slate-100"
  };

  const badgeClasses = {
    rose: "bg-rose-100 text-[#8E1035]",
    amber: "bg-amber-100 text-amber-800",
    emerald: "bg-emerald-100 text-emerald-800",
    indigo: "bg-indigo-100 text-indigo-800",
    slate: "bg-slate-100 text-slate-800"
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm transition-all duration-200 ${
        onClick ? "cursor-pointer hover:shadow-md hover:border-slate-300" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </span>
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center border ${accentClasses[accentColor]}`}
        >
          {icon}
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          {value}
        </span>
        {badge && (
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badgeClasses[badgeColor]}`}
          >
            {badge}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="text-xs text-slate-500 font-medium leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}
