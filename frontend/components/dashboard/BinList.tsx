"use client";

import { useMemo, useState } from "react";
import { ArrowDownWideNarrow, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { STATUS_LABELS } from "@/lib/constants";
import type { Bin, BinStatus } from "@/lib/types";

import BinStatusCard from "./BinStatusCard";

type StatusFilter = "all" | BinStatus;
type SortKey = "fillPct" | "lastUpdated";

const STATUS_FILTERS: StatusFilter[] = ["all", "good", "warning", "critical"];
const SORT_LABEL: Record<SortKey, string> = { fillPct: "Fill level", lastUpdated: "Last updated" };

// A municipal operator's actual working view of bins: filter down to
// what needs attention, sort by what matters right now, and export a CSV
// for a council report — a card grid alone doesn't cover any of that.
function downloadCsv(bins: Bin[]) {
  const header = ["id", "label", "fillPct", "status", "mode", "connection", "lastUpdated"];
  const rows = bins.map((bin) => [
    bin.id,
    bin.label,
    bin.fillPct,
    bin.status,
    bin.mode,
    bin.connection,
    bin.lastUpdated,
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `streetwise-bins-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function BinList({ bins }: { bins: Bin[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("fillPct");

  const visibleBins = useMemo(() => {
    const filtered =
      statusFilter === "all" ? bins : bins.filter((bin) => bin.status === statusFilter);
    return [...filtered].sort((a, b) =>
      sortKey === "fillPct" ? b.fillPct - a.fillPct : b.lastUpdated.localeCompare(a.lastUpdated)
    );
  }, [bins, statusFilter, sortKey]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter bins by status">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter}
              size="sm"
              variant={statusFilter === filter ? "default" : "outline"}
              onClick={() => setStatusFilter(filter)}
            >
              {filter === "all" ? "All" : STATUS_LABELS[filter]}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSortKey(sortKey === "fillPct" ? "lastUpdated" : "fillPct")}
          >
            <ArrowDownWideNarrow className="h-3.5 w-3.5" />
            Sort: {SORT_LABEL[sortKey]}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadCsv(visibleBins)}
            disabled={visibleBins.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {visibleBins.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No bins match this filter.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleBins.map((bin) => (
            <BinStatusCard key={bin.id} bin={bin} />
          ))}
        </div>
      )}
    </div>
  );
}
