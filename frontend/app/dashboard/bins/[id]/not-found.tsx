import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function BinNotFound() {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-xl font-semibold">Bin not found</h1>
      <p className="text-sm text-muted-foreground">
        This bin isn&apos;t in the registry and has never reported telemetry.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard">Back to overview</Link>
      </Button>
    </div>
  );
}
