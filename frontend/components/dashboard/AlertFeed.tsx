"use client";

import { useState } from "react";
import { AlertTriangle, Camera, Check, Loader2, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { resolveAlert } from "@/lib/api";
import type { Alert, AlertType } from "@/lib/types";

const ALERT_ICON: Record<AlertType, typeof AlertTriangle> = {
  overflow: AlertTriangle,
  littering: Camera,
  offline: WifiOff,
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
    <ul className="flex flex-col divide-y divide-border">
      {alerts.map((alert) => {
        const Icon = ALERT_ICON[alert.type] ?? AlertTriangle;
        const isResolving = resolvingId === alert.id;
        return (
          <li key={alert.id} className="flex items-start gap-3 py-3 text-sm">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <span className="font-medium capitalize">{alert.type}</span>
              {" — "}
              {alert.message}
              <div className="mt-0.5 text-xs text-muted-foreground">
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
