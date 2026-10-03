import SidebarNav from "./SidebarNav";
import ThemeToggle from "./ThemeToggle";

// Persistent nav for the municipal/operator side — desktop only. On
// smaller screens MobileNav (a Sheet drawer) takes over instead, so a
// 240px-wide rail never eats into a phone-width viewport.
export default function Sidebar() {
  return (
    <aside className="hidden min-h-screen w-60 shrink-0 flex-col border-r border-border p-5 lg:flex">
      <SidebarNav />
      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">Theme</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}
