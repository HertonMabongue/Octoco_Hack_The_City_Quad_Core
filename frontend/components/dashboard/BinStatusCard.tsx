import Link from "next/link";
import { Flame, ShieldAlert, Users, WifiOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { GAS_ALERT_RAW, STATUS_LABELS, TRAFFIC_HIGH_COUNT } from "@/lib/constants";
import type { Bin } from "@/lib/types";

// One bin, summarised: fill-level bar + status badge, plus the bin's other
// three independent sensors (gas, traffic, movement — see
// firmware/src/OctocoEsp32Project.ino) when they have something notable to
// say. Kept conditional rather than four badges on every card: most ticks
// have nothing hazard/tamper-worthy to report, and a card that shouts
// about every sensor every time trains operators to tune all of it out.
export default function BinStatusCard({ bin }: { bin: Bin }) {
  const gasHazard = bin.gasRaw != null && bin.gasRaw >= GAS_ALERT_RAW;
  const highTraffic = bin.peopleCount != null && bin.peopleCount >= TRAFFIC_HIGH_COUNT;

  return (
    <Link href={`/dashboard/bins/${bin.id}`} className="block">
      <Card className="transition-colors hover:border-primary/50">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <strong className="text-sm font-semibold">{bin.label}</strong>
            <div className="flex items-center gap-1.5">
              {bin.connection === "offline" && (
                <WifiOff className="h-3.5 w-3.5 text-muted-foreground" aria-label="Offline" />
              )}
              <Badge variant={bin.status} dot>
                {STATUS_LABELS[bin.status]}
              </Badge>
            </div>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-[hsl(var(--status-good))] data-[status=critical]:bg-[hsl(var(--status-critical))] data-[status=warning]:bg-[hsl(var(--status-warning))]"
              data-status={bin.status}
              style={{ width: `${bin.fillPct}%` }}
            />
          </div>

          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
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
        </CardContent>
      </Card>
    </Link>
  );
}
