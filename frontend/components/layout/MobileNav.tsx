"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Recycle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import SidebarNav from "./SidebarNav";

// Top bar + slide-in drawer for the municipal dashboard on small screens,
// replacing the persistent Sidebar (see Sidebar.tsx) below the lg breakpoint.
export default function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-between border-b border-border p-4 lg:hidden">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <Recycle className="h-5 w-5 text-primary" />
        Clean Corridor
      </Link>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Open navigation menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
