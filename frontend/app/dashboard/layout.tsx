import type { Metadata } from "next";

import Sidebar from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s · Municipal Dashboard",
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-6 lg:p-8">{children}</div>
    </div>
  );
}
