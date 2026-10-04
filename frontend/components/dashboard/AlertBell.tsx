"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { API_HEADERS, API_URL } from "@/lib/constants";
import type { Alert } from "@/lib/types";

const POLL_MS = 30_000;

// A small, independent read of the active alert count for the topbar —
// kept separate from the page's own server-fetched AlertFeed so the
// topbar (present on every dashboard route, not just the overview) has
// something to show without every page having to fetch and pass it down.
export default function AlertBell() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`${API_URL}/api/alerts`, { cache: "no-store", headers: API_HEADERS });
        if (!res.ok) throw new Error(String(res.status));
        const alerts = (await res.json()) as Alert[];
        if (!cancelled) setCount(alerts.length);
      } catch {
        if (!cancelled) setCount(0);
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <Link
      href="/dashboard"
      aria-label={count ? `${count} active alerts` : "Alerts"}
      className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <Bell className="h-4 w-4" />
      {!!count && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-mono text-[10px] font-semibold leading-none text-destructive-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
