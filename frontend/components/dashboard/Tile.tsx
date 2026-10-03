import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface TileProps {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  // "info" and "violet" are purely decorative — they give a row of
  // tiles some visual variety when none of them are actually reporting
  // a problem. "good" / "warning" / "critical" stay reserved for real
  // state, so colour never gets ambiguous between the two jobs.
  tone?: "default" | "good" | "warning" | "critical" | "info" | "violet";
}

const TONE_ICON_CLASS: Record<NonNullable<TileProps["tone"]>, string> = {
  default: "bg-secondary text-foreground",
  good: "bg-status-good/10 text-status-good",
  warning: "bg-status-warning/10 text-status-warning",
  critical: "bg-status-critical/10 text-status-critical",
  info: "bg-chip-info/10 text-chip-info",
  violet: "bg-chip-violet/10 text-chip-violet",
};

// The one stat-card shape used everywhere a single number needs a card:
// the corridor overview's headline figures, the insights page's
// cost-savings estimate, a bin's sensor readout. Icon in a tinted chip,
// a big tabular-nums mono figure, and an optional line of real context
// underneath it, rather than an invented trend arrow — there's no
// historical baseline for most of these numbers yet, so showing one
// would be decoration, not information.
export default function Tile({ label, value, sub, icon: Icon, tone = "default" }: TileProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", TONE_ICON_CLASS[tone])}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="mt-2 font-mono text-[1.65rem] font-semibold leading-none tabular-nums tracking-tight">
        {value}
      </div>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
