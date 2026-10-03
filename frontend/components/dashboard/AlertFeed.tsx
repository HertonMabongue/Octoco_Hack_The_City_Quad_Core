"use client";

import { useState } from "react";
import { AlertTriangle, Camera, Check, Flame, Loader2, ShieldAlert, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { resolveAlert } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Alert, AlertType } from "@/lib/types";

const ALERT_ICON: Record<AlertType, typeof AlertTriangle> = {
  overflow: AlertTriangle,
  littering: Camera,
  offline: WifiOff,
  hazard: Flame,
  tamper: ShieldAlert,
};

const ALERT_TONE: Record<AlertType, string> = {
  overflow: "bg-status-warning/10 text-status-warning",
  littering: "bg-secondary text-foreground",
  offline: "bg-muted text-muted-foreground",
  hazard: "bg-status-critical/10 text-status-critical",
  tamper: "bg-status-critical/10 text-status-critical",
};

// A chronological feed of alerts — bin overflows and community littering
// reports both land here, since an operator cares about both. Resolving
// one removes it from this feed (operators don't want a feed that only
// ever grows) without needing a full page reload.
export default function AlertFeed({ alerts: initialAlerts }: { alerts: Alert[] }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  async function handleResolve(id: string) {
    setResolvingId(id);
    const result = await resolveAlert(id);
    setResolvingId(null);
    if (result) {
      setAlerts((current) => current.filter((alert) => alert.id !== id));
    }
  }

  if (!alerts.length) {
    return <p className="text-sm text-muted-foreground">No active alerts.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border/60">
      {alerts.map((alert) => {
        const Icon = ALERT_ICON[alert.type] ?? AlertTriangle;
        const isResolving = resolvingId === alert.id;
        return (
          <li key={alert.id} className="flex items-start gap-3 py-3 text-sm">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                ALERT_TONE[alert.type]
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="font-medium capitalize">{alert.type}:</span> {alert.message}
              <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                {new Date(alert.createdAt).toLocaleString()}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1 px-2 text-xs"
              disabled={isResolving}
              onClick={() => handleResolve(alert.id)}
            >
              {isResolving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Resolve
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
