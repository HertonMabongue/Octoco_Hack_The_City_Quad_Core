import Link from "next/link";
import { ArrowLeft, LayoutDashboard, Recycle } from "lucide-react";

// Nav links shared between the persistent desktop Sidebar and the
// mobile Sheet drawer (see Sidebar.tsx / MobileNav.tsx) — one source of
// truth for the operator-side navigation.
export default function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col">
      <Link href="/" onClick={onNavigate} className="mb-8 flex items-center gap-2 font-semibold">
        <Recycle className="h-5 w-5 text-primary" />
        Clean Corridor
      </Link>

      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
      >
        <LayoutDashboard className="h-4 w-4" />
        Overview
      </Link>

      <Link
        href="/"
        onClick={onNavigate}
        className="mt-auto flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>
    </nav>
  );
}
