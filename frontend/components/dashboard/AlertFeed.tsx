import { AlertTriangle, Camera, WifiOff } from "lucide-react";

import type { Alert, AlertType } from "@/lib/types";

const ALERT_ICON: Record<AlertType, typeof AlertTriangle> = {
  overflow: AlertTriangle,
  littering: Camera,
  offline: WifiOff,
};

// A simple chronological feed of alerts — bin overflows and community
// littering reports both land here, since an operator cares about both.
export default function AlertFeed({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) {
    return <p className="text-sm text-muted-foreground">No active alerts.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {alerts.map((alert) => {
        const Icon = ALERT_ICON[alert.type] ?? AlertTriangle;
        return (
          <li key={alert.id} className="flex gap-3 py-3 text-sm">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <span className="font-medium capitalize">{alert.type}</span>
              {" — "}
              {alert.message}
              <div className="mt-0.5 text-xs text-muted-foreground">
                {new Date(alert.createdAt).toLocaleString()}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
