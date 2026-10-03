import Link from "next/link";
import { ArrowRight, MapPinOff } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="container flex min-h-[70vh] flex-col items-center justify-center gap-4 py-20 text-center"
    >
      <MapPinOff className="h-10 w-10 text-muted-foreground" />
      <h1 className="font-display text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        That page doesn&apos;t exist, or it may have moved. Try one of these instead:
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <Button asChild>
          <Link href="/">
            Home
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Municipal dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/community">Community app</Link>
        </Button>
      </div>
    </main>
  );
}
