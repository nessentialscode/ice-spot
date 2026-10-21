import React, { ReactNode } from "react";
import { Search, ChevronLeft, ChevronRight, Inbox } from "lucide-react";

interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  className?: string;
  render?: (row: T, index: number) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  actions?: ReactNode;
  emptyMessage?: string;
  emptySubtext?: string;
  totalCount?: number;
  currentPage?: number;
  pageSize?: number;
  onPageChange?: (newPage: number) => void;
  isLoading?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search records...",
  filters,
  actions,
  emptyMessage = "No matching records found",
  emptySubtext = "Try adjusting your filters or search keywords.",
  totalCount,
  currentPage = 1,
  pageSize = 10,
  onPageChange,
  isLoading = false
}: DataTableProps<T>) {
  const count = totalCount ?? data.length;
  const totalPages = Math.ceil(count / pageSize) || 1;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Table Toolbar */}
      {(onSearchChange || filters || actions) && (
        <div className="p-4 border-b border-slate-200/80 bg-slate-50/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {onSearchChange && (
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchValue || ""}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D83162]/20 focus:border-[#D83162] transition-colors"
                />
              </div>
            )}
            {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
          </div>

          {actions && <div className="flex items-center gap-2 self-end sm:self-auto">{actions}</div>}
        </div>
      )}

      {/* Table Container */}
      <div className="overflow-x-auto min-h-[220px]">
        <table className="w-full text-left text-xs sm:text-sm text-slate-700">
          <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold text-[11px] uppercase tracking-wider">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`px-4 py-3 whitespace-nowrap ${col.className || ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-slate-400">
                  <div className="inline-block w-6 h-6 border-2 border-slate-300 border-t-[#D83162] rounded-full animate-spin mb-2"></div>
                  <div className="text-xs">Loading operational data...</div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-14 text-center">
                  <div className="max-w-xs mx-auto flex flex-col items-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                      <Inbox className="w-6 h-6 stroke-[1.5]" />
                    </div>
                    <div className="font-semibold text-slate-800 text-sm mb-1">
                      {emptyMessage}
                    </div>
                    <div className="text-xs text-slate-500">{emptySubtext}</div>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={keyExtractor(row)}
                  className="hover:bg-slate-50/70 transition-colors"
                >
                  {columns.map((col, cIdx) => (
                    <td
                      key={cIdx}
                      className={`px-4 py-3.5 align-middle ${col.className || ""}`}
                    >
                      {col.render
                        ? col.render(row, idx)
                        : col.accessorKey
                        ? String(row[col.accessorKey] ?? "")
                        : null}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Table Pagination Footer */}
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/60 flex items-center justify-between text-xs text-slate-500">
        <div>
          Showing <span className="font-semibold text-slate-800">{data.length}</span> of{" "}
          <span className="font-semibold text-slate-800">{count}</span> records
        </div>

        {totalPages > 1 && onPageChange && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
