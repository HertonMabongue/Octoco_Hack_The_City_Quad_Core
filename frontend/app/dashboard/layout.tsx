import type { Metadata } from "next";
import { cookies } from "next/headers";

import Dusty from "@/components/assistant/Dusty";
import DashboardTopbar from "@/components/layout/DashboardTopbar";
import Footer from "@/components/layout/Footer";
import MobileNav from "@/components/layout/MobileNav";
import Sidebar from "@/components/layout/Sidebar";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s · Municipal Dashboard",
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // middleware.ts already turned away anyone without a session cookie
  // before this layout ever renders, so this is read-only display (who's
  // signed in), not a second auth check.
  const session = decodeSession(cookies().get(SESSION_COOKIE)?.value);
  const username = session?.username ?? "operator";

  return (
    <div className="flex min-h-screen flex-col">
      <MobileNav />
      <div className="flex flex-1 lg:flex-row">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <DashboardTopbar username={username} />
          <main id="main-content" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
      <Footer />
      <Dusty />
    </div>
  );
}
