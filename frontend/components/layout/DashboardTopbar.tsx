import AlertBell from "@/components/dashboard/AlertBell";
import LogoutButton from "@/components/auth/LogoutButton";

import SectionLabel from "./SectionLabel";

// Desktop-only header for the municipal dashboard, alongside the
// persistent Sidebar (see Sidebar.tsx) — the sidebar carries navigation,
// this carries the operator's current context: where they are, whether
// the feed is live, and who's signed in. Mobile keeps MobileNav's own
// top bar instead (see dashboard/layout.tsx), so this never doubles up
// with it below the lg breakpoint.
export default function DashboardTopbar({ username }: { username: string }) {
  return (
    <header className="hidden h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-6 lg:flex">
      <SectionLabel />

      <div className="flex items-center gap-4">
        <span className="hidden items-center gap-1.5 font-mono text-xs text-muted-foreground sm:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-good opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-status-good" />
          </span>
          LIVE
        </span>

        <AlertBell />

        <div className="flex items-center gap-2 border-l border-border pl-3">
          <span className="text-sm text-muted-foreground">
            <span className="hidden sm:inline">Operator:</span>{" "}
            <span className="font-medium text-foreground">{username}</span>
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
