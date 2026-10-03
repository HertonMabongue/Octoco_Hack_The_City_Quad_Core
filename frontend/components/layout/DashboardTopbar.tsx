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
    <header className="hidden h-14 shrink-0 items-center justify-between gap-4 border-b border-border/60 bg-card/60 px-6 backdrop-blur lg:flex">
      <SectionLabel />

      <div className="flex items-center gap-3">
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
