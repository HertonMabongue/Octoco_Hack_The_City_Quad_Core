"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Archive, LayoutDashboard, Recycle, TrendingUp, UserCog } from "lucide-react";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/insights", label: "Machine Learning", icon: TrendingUp, exact: false },
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
      <Link
        href="/"
        onClick={onNavigate}
        className="font-display mb-8 flex items-center gap-2.5 text-[15px] font-semibold"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Recycle className="h-4 w-4" />
        </span>
        Clean Corridor
      </Link>

      <span className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        Operate
      </span>

      {LINKS.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
            )}
            <link.icon className="h-4 w-4 shrink-0" />
            {link.label}
          </Link>
        );
      })}

      <Link
        href="/"
        onClick={onNavigate}
        className="mt-auto flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>
    </nav>
  );
}
