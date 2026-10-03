import Link from "next/link";
import { ArrowLeft, LayoutDashboard, Recycle } from "lucide-react";

// Static nav for the municipal/operator side. Plain server component —
// no interactivity needed yet.
export default function Sidebar() {
  return (
    <nav className="flex min-h-screen w-60 shrink-0 flex-col border-r border-border p-5">
      <Link href="/" className="mb-8 flex items-center gap-2 font-semibold">
        <Recycle className="h-5 w-5 text-primary" />
        Clean Corridor
      </Link>

      <Link
        href="/dashboard"
        className="mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
      >
        <LayoutDashboard className="h-4 w-4" />
        Overview
      </Link>

      <Link
        href="/"
        className="mt-auto flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>
    </nav>
  );
}
