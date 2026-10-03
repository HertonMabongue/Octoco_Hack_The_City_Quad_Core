"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 shadow-card">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <div>
        <h2 className="font-semibold">Couldn&apos;t load the dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The backend may be unreachable. Check that the API is running and reachable at the
          configured URL.
        </p>
      </div>
      <Button onClick={reset} variant="outline" size="sm">
        Try again
      </Button>
    </div>
  );
}
