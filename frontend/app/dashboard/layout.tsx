import type { Metadata } from "next";

import MobileNav from "@/components/layout/MobileNav";
import Sidebar from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s · Municipal Dashboard",
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:flex">
      <MobileNav />
      <Sidebar />
      <div className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</div>
    </div>
  );
}
