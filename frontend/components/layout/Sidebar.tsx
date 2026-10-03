import SidebarNav from "./SidebarNav";
import ThemeToggle from "./ThemeToggle";

// Persistent nav for the municipal/operator side — desktop only. On
// smaller screens MobileNav (a Sheet drawer) takes over instead, so a
// 240px-wide rail never eats into a phone-width viewport. A faint tint
// and right-edge shadow (rather than just a border) separate it from
// the main panel the way a physical control rail would sit proud of it.
export default function Sidebar() {
  return (
    <aside className="hidden min-h-screen w-60 shrink-0 flex-col bg-secondary/30 p-4 shadow-[1px_0_0_hsl(var(--border)),2px_0_12px_-4px_hsl(var(--shadow-color)/0.08)] lg:flex">
      <SidebarNav />
      <div className="mt-4 flex items-center justify-between rounded-md border border-border/60 bg-card px-3 py-2">
        <span className="text-xs text-muted-foreground">Theme</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}
