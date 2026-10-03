import type { Metadata } from "next";

import Footer from "@/components/layout/Footer";
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
    <div className="flex min-h-screen flex-col">
      <MobileNav />
      <div className="flex flex-1 lg:flex-row">
        <Sidebar />
        <main id="main-content" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
      <Footer />
    </div>
  );
}
