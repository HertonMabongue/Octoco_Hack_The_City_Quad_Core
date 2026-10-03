import type { Bin } from "@/lib/types";

// A one-line read of the corridor before anyone even looks at the map,
// same utilitarian stat-strip language as the municipal dashboard's
// StatTiles, scaled down for a page residents skim on a phone rather
// than an operator's desktop.
export default function BinsSummaryStrip({ bins }: { bins: Bin[] }) {
  const fillingUp = bins.filter((b) => b.status === "warning").length;
  const needsCollection = bins.filter((b) => b.status === "critical").length;

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-muted-foreground">
      <span>
        <span className="font-semibold text-foreground">{bins.length}</span> bins tracked
      </span>
      <span>
        <span className="font-semibold text-status-warning">{fillingUp}</span> filling up
      </span>
      <span>
        <span className="font-semibold text-status-critical">{needsCollection}</span> need
        collection
      </span>
    </div>
  );
}
