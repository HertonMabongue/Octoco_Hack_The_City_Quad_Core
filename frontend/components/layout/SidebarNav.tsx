"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Archive,
  LayoutDashboard,
  Recycle,
  TrendingUp,
  UserCog,
} from "lucide-react";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/insights", label: "Insights", icon: TrendingUp, exact: false },
  { href: "/dashboard/library", label: "Library", icon: Archive, exact: false },
  { href: "/dashboard/account", label: "Account", icon: UserCog, exact: false },
];

// Nav links shared between the persistent desktop Sidebar and the
// mobile Sheet drawer (see Sidebar.tsx / MobileNav.tsx) — one source of
// truth for the operator-side navigation.
export default function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col">
      <Link href="/" onClick={onNavigate} className="mb-8 flex items-center gap-2 font-semibold">
        <Recycle className="h-5 w-5 text-primary" />
        Clean Corridor
      </Link>

      {LINKS.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent",
              active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <link.icon className="h-4 w-4" />
            {link.label}
          </Link>
        );
      })}

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
