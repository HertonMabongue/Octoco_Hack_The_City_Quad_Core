import Link from "next/link";
import { ArrowRight, Flame, Footprints, Vibrate, Waves } from "lucide-react";

import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";

// Each bin carries four independent sensors (see
// firmware/src/OctocoEsp32Project.ino) — this is the real threshold logic
// that runs on the device, not marketing copy. Shown as a spec sheet rather
// than an icon grid so the homepage says something specific instead of
// something generic.
const SENSORS = [
  {
    icon: Waves,
    name: "Ultrasonic",
    part: "HC-SR04",
    measures: "Distance from the lid to the waste surface",
    trigger: "Full once waste sits within 3cm of the sensor",
  },
  {
    icon: Flame,
    name: "Gas",
    part: "MQ-series",
    measures: "Raw air-quality reading inside the bin",
    trigger: "Hazard flagged above a raw reading of 800",
  },
  {
    icon: Footprints,
    name: "Human Presence",
    part: "PIR",
    measures: "Foot traffic passing the bin",
    trigger: "High traffic at 5+ detections in a 10s window",
  },
  {
    icon: Vibrate,
    name: "Accelerometer",
    part: "ADXL345",
    measures: "Movement against a calibrated baseline",
    trigger: "Tamper flagged on 5 consecutive readings over 3 m/s²",
  },
];

// Deliberately two sections and nothing else: a hero that states the
// idea once, and the spec sheet that backs it up. No repeated CTA cards,
// no logo strip, no feature-grid filler — the dashboard and community
// app links live in the hero and the footer, not three more times in
// between.
export default function HomePage() {
  return (
    <>
      <main id="main-content">
        <section>
          <div className="container grid gap-12 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-28">
            <div className="flex flex-col gap-6">
              <span className="text-sm font-medium uppercase tracking-widest text-primary">
                Adam Tas Corridor, Stellenbosch
              </span>

              <h1 className="max-w-xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                Four sensors. One signal before overflow.
              </h1>

              <p className="max-w-lg text-lg text-muted-foreground">
                Smart bins that detect fill, air quality, foot traffic, and tampering, with
                collection alerts for the city and a simple way for residents to report waste.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button asChild size="lg">
                  <Link href="/dashboard">
                    Municipal dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/community">Community app</Link>
                </Button>
              </div>
            </div>

            {/* A device-readout mockup, styled after the bin's own OLED
                status screen, instead of a stock illustration — this is
                what the dashboard is actually built from. */}
            <div className="bg-grid-dots rounded-xl border border-black/40 bg-[#0d120f] p-5 font-mono text-[#d7f5df] shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-3 text-xs text-[#9fd6ad]">
                <span>BIN-03 · Bergkelder corner</span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ff5c5c]" />
                  emergency mode
                </span>
              </div>
              <dl className="mt-3 flex flex-col gap-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-[#9fd6ad]">
                    <Waves className="h-3.5 w-3.5" /> fill
                  </dt>
                  <dd>93%</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-[#ff8b6a]">
                    <Flame className="h-3.5 w-3.5" /> gas (raw)
                  </dt>
                  <dd className="text-[#ff8b6a]">890 (hazard)</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-[#9fd6ad]">
                    <Footprints className="h-3.5 w-3.5" /> traffic (10s)
                  </dt>
                  <dd>1</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-[#ff8b6a]">
                    <Vibrate className="h-3.5 w-3.5" /> movement
                  </dt>
                  <dd className="text-[#ff8b6a]">alert</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="container pb-24">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            What&apos;s on each bin
          </h2>
          <div className="mt-4 divide-y divide-border/70 overflow-hidden rounded-xl border border-border/60 bg-card shadow-card">
            {SENSORS.map((sensor) => (
              <div
                key={sensor.name}
                className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-6"
              >
                <div className="flex items-center gap-3 sm:w-48 sm:shrink-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <sensor.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="font-medium leading-tight">{sensor.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{sensor.part}</div>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground sm:flex-1">{sensor.measures}</div>
                <div className="text-sm sm:flex-1">{sensor.trigger}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
