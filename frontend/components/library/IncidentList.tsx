"use client";

import { useState } from "react";
import { Check, Loader2, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/constants";
import { resolveReport } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ReportRecord } from "@/lib/types";

// The municipal incident log: every community littering report, resolved
// ones included (see db.list_reports' include_resolved default) — a
// library is a record you can look back through, not just a queue of
// what's still open, so this doesn't drop a row once it's handled the
// way AlertFeed drops a resolved alert.
export default function IncidentList({ reports: initial }: { reports: ReportRecord[] }) {
  const [reports, setReports] = useState(initial);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  async function handleResolve(id: string) {
    setResolvingId(id);
    const updated = await resolveReport(id);
    setResolvingId(null);
    if (updated) {
      setReports((current) => current.map((r) => (r.id === id ? updated : r)));
    }
  }

  if (!reports.length) {
    return <p className="text-sm text-muted-foreground">No community reports yet.</p>;
  }

  return (
    <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/60 bg-card shadow-card">
      {reports.map((report) => (
        <div
          key={report.id}
          className={cn(
            "relative flex gap-4 py-4 pl-6 pr-4 before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
            report.resolved ? "before:bg-status-good" : "before:bg-status-warning"
          )}
        >
          {report.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${API_URL}${report.photoUrl}`}
              alt="Reported littered area"
              className="h-20 w-20 shrink-0 rounded-md border border-border object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
              <MapPin className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{report.note || "Community report: littered area"}</p>
              <Badge variant={report.resolved ? "good" : "warning"} dot>
                {report.resolved ? "Resolved" : "Open"}
              </Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>{new Date(report.createdAt).toLocaleString()}</span>
              {report.lat != null && report.lng != null && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <MapPin className="h-3 w-3" />
                  {report.lat.toFixed(4)}, {report.lng.toFixed(4)}
                </span>
              )}
            </div>
          </div>
          {!report.resolved && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1 self-start px-2 text-xs"
              disabled={resolvingId === report.id}
              onClick={() => handleResolve(report.id)}
            >
              {resolvingId === report.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Resolve
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
