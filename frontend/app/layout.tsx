import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: {
    default: "Clean Corridor — Waste Management System",
    template: "%s · Clean Corridor",
  },
  description:
    "Live bin fill-level monitoring and community littering reports for the Adam Tas Corridor, Stellenbosch.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
