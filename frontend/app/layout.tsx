import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { SITE_URL } from "@/lib/constants";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const DESCRIPTION =
  "Live bin fill-level monitoring and community littering reports for the Adam Tas Corridor, Stellenbosch.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Clean Corridor — Waste Management System",
    template: "%s · Clean Corridor",
  },
  description: DESCRIPTION,
  keywords: [
    "waste management",
    "Stellenbosch",
    "Adam Tas Corridor",
    "smart bins",
    "IoT",
    "illegal dumping",
    "recycling",
    "Hack the City",
  ],
  openGraph: {
    type: "website",
    siteName: "Clean Corridor",
    title: "Clean Corridor — Waste Management System",
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_ZA",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clean Corridor — Waste Management System",
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1a7a33",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
