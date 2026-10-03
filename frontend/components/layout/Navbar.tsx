import Link from "next/link";
import { Recycle } from "lucide-react";

import { Button } from "@/components/ui/button";

// Top nav for the public/community side.
export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-16 items-center justify-between gap-3">
        <Link href="/community" className="flex items-center gap-2.5 font-display text-[15px] font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Recycle className="h-4 w-4" />
          </span>
          Clean Corridor
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link href="/community/report">Report littering</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
