import { STATUS_LABELS } from "@/lib/constants";
import type { BinStatus } from "@/lib/types";

const STATUSES: BinStatus[] = ["good", "warning", "critical"];

const DOT_CLASS: Record<BinStatus, string> = {
  good: "bg-status-good",
  warning: "bg-status-warning",
  critical: "bg-status-critical",
};

// Explains the map's colour coding — not everyone looking at this
// dashboard knows the system, and colour should never carry meaning
// alone.
export default function MapLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {STATUSES.map((status) => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${DOT_CLASS[status]}`} />
          {STATUS_LABELS[status]}
        </span>
      ))}
    </div>
  );
}
