"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

import { cn } from "@/lib/utils";

const REFRESH_INTERVAL_MS = 30_000; // matches the telemetry cadence — no point polling faster

// Periodically re-runs the dashboard page's server-side data fetch
// (router.refresh() re-executes Server Components without a full page
// reload or losing client state like scroll position). Pauses while the
// tab is hidden so it doesn't poll in the background for nothing.
export default function AutoRefresh() {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function tick() {
      if (document.hidden) return;
      setSpinning(true);
      router.refresh();
      window.setTimeout(() => setSpinning(false), 600);
    }

    intervalRef.current = setInterval(tick, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <RotateCw className={cn("h-3 w-3", spinning && "animate-spin")} />
      Live · updates every 30s
    </span>
  );
}
