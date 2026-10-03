import type { Metadata } from "next";

import Navbar from "@/components/layout/Navbar";

export const metadata: Metadata = {
  title: {
    default: "Community",
    template: "%s · Community App",
  },
};

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Navbar />
      <main className="container py-8">{children}</main>
    </div>
  );
}
