import Link from "next/link";
import { Recycle } from "lucide-react";

import { Button } from "@/components/ui/button";

import ThemeToggle from "./ThemeToggle";

// Top nav for the public/community side.
export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-16 items-center justify-between gap-3">
        <Link href="/community" className="flex items-center gap-2 font-semibold">
          <Recycle className="h-5 w-5 text-primary" />
          Clean Corridor
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/community/report">Report littering</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
