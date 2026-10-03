import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";

import "./globals.css";
import { SITE_URL } from "@/lib/constants";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// A dedicated data face for the municipal dashboard's readouts (fill
// percentages, counts, timestamps) — the same monospace-console
// language the homepage's device mockup already uses, carried through
// rather than falling back to the body font for every number.
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

// Headings and nav labels only (see tailwind.config.ts's `font-display`)
// so the page has two typefaces doing two different jobs instead of
// Inter carrying every size from h1 down to body copy.
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });

const DESCRIPTION =
  "Live bin fill-level monitoring and community littering reports for the Adam Tas Corridor, Stellenbosch.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Clean Corridor · Waste Management System",
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
    title: "Clean Corridor · Waste Management System",
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_ZA",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clean Corridor · Waste Management System",
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
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable}`}>
      <body className="font-sans antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
