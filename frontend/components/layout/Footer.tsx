import Link from "next/link";
import { Recycle } from "lucide-react";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border">
      <div className="container flex flex-col gap-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Recycle className="h-4 w-4 shrink-0 text-primary" />
          <span>&copy; {year} Clean Corridor. Built for Hack the City — Team Quad-Core.</span>
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">
            Municipal dashboard
          </Link>
          <Link href="/community" className="transition-colors hover:text-foreground">
            Community app
          </Link>
          <Link href="/community/report" className="transition-colors hover:text-foreground">
            Report littering
          </Link>
        </nav>
      </div>
    </footer>
  );
}
