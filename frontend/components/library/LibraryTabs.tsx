"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  panel: ReactNode;
}

// Plain state-based tabs, no animation, no portal — the library's three
// sections (reports, registry, docs) are each a full page's worth of
// content, so this is closer to a view switcher than a widget. Renders
// every panel's content from server-fetched props (see
// app/dashboard/library/page.tsx), this component only owns which one
// is visible.
export default function LibraryTabs({ tabs }: { tabs: Tab[] }) {
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-1.5 border-b border-border pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active?.id}
            onClick={() => setActiveId(tab.id)}
            className={cn(
              "rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab.id === active?.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="pt-5">{active?.panel}</div>
    </div>
  );
}
