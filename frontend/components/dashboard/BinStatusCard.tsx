import Link from "next/link";
import { WifiOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_LABELS } from "@/lib/constants";
import type { Bin } from "@/lib/types";

// One bin, summarised: fill-level bar + status badge. Used in the ops
// dashboard list and reused wherever a compact bin summary is needed.
export default function BinStatusCard({ bin }: { bin: Bin }) {
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
              className="h-full rounded-full bg-[hsl(var(--status-good))] data-[status=warning]:bg-[hsl(var(--status-warning))] data-[status=critical]:bg-[hsl(var(--status-critical))]"
              data-status={bin.status}
              style={{ width: `${bin.fillPct}%` }}
            />
          </div>

          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{bin.fillPct}% full</span>
            <span className="capitalize">{bin.mode} mode</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
