import Link from "next/link";
import { Flame, ShieldAlert, Users, WifiOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { GAS_ALERT_RAW, STATUS_LABELS, TRAFFIC_HIGH_COUNT } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Bin } from "@/lib/types";

const ACCENT_CLASS: Record<Bin["status"], string> = {
  good: "before:bg-status-good",
  warning: "before:bg-status-warning",
  critical: "before:bg-status-critical",
};

// One bin, summarised: fill-level bar + status badge, plus the bin's other
// three independent sensors (gas, traffic, movement — see
// firmware/src/OctocoEsp32Project.ino) when they have something notable to
// say. A status-colored rail down the left edge (the `before:` pseudo
// element) carries the status read at a glance, instead of washing the
// whole card in a tint — so a critical bin reads as "flagged," not as a
// different, alarmed product. Kept conditional rather than four badges on
// every card: most ticks have nothing hazard/tamper-worthy to report, and
// a card that shouts about every sensor every time trains operators to
// tune all of it out.
export default function BinStatusCard({ bin }: { bin: Bin }) {
  const gasHazard = bin.gasRaw != null && bin.gasRaw >= GAS_ALERT_RAW;
  const highTraffic = bin.peopleCount != null && bin.peopleCount >= TRAFFIC_HIGH_COUNT;

  return (
    <Link href={`/dashboard/bins/${bin.id}`} className="block">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 shadow-card transition-all before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-[''] hover:-translate-y-0.5 hover:shadow-card-hover",
          ACCENT_CLASS[bin.status]
        )}
      >
        <div className="mb-3 flex items-center justify-between gap-2 pl-1.5">
          <strong className="font-display text-sm font-semibold">{bin.label}</strong>
          <div className="flex items-center gap-1.5">
            {bin.connection === "offline" && (
              <WifiOff className="h-3.5 w-3.5 text-muted-foreground" aria-label="Offline" />
            )}
            <Badge variant={bin.status} dot>
              {STATUS_LABELS[bin.status]}
            </Badge>
          </div>
        </div>

        <div className="pl-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-[hsl(var(--status-good))] transition-[width] data-[status=critical]:bg-[hsl(var(--status-critical))] data-[status=warning]:bg-[hsl(var(--status-warning))]"
              data-status={bin.status}
              style={{ width: `${bin.fillPct}%` }}
            />
          </div>

          <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground">
            <span>{bin.fillPct}% full</span>
            <span className="capitalize">{bin.mode} mode</span>
          </div>

          {(bin.movementAlert || gasHazard || highTraffic) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {bin.movementAlert && (
                <Badge variant="critical" className="gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  Possible tamper
                </Badge>
              )}
              {gasHazard && (
                <Badge variant="critical" className="gap-1">
                  <Flame className="h-3 w-3" />
                  Gas hazard
                </Badge>
              )}
              {highTraffic && (
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" />
                  High traffic
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
