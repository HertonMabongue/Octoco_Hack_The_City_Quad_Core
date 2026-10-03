import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Flame, Footprints, Vibrate, Waves } from "lucide-react";

import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";

import heroImage from "../public/images/corridor-hero.jpg";

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

// Deliberately two sections and nothing else: a full-bleed photo hero
// that states the idea once, and the spec sheet that backs it up. No
// repeated CTA cards, no logo strip, no feature-grid filler.
export default function HomePage() {
  return (
    <>
      <main id="main-content">
        <section className="relative flex min-h-[92vh] items-center overflow-hidden">
          <Image
            src={heroImage}
            alt="Smart Waste Management"
            fill
            priority
            placeholder="blur"
            sizes="100vw"
            className="object-cover"
          />
          {/* Darkens left-to-right and bottom-to-top so white text sits on
              a readable patch of sky rather than the whole photo being
              washed out — the image itself stays recognisable. */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-black/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10" />

          <div className="container relative flex flex-col gap-6 py-24 text-white">
            <span className="text-sm font-medium uppercase tracking-widest text-white/80">
              Adam Tas Corridor, Stellenbosch
            </span>

            <h1 className="font-display max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Four sensors. One signal before overflow.
            </h1>

            <p className="max-w-lg text-lg text-white/85">
              Smart bins that detect fill, air quality, foot traffic, and tampering, with collection
              alerts for the city and a simple way for residents to report waste.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button asChild size="lg" className="bg-white text-black shadow-lg hover:bg-white/90">
                <Link href="/dashboard">
                  Municipal dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/40 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white"
              >
                <Link href="/community">Community app</Link>
              </Button>
            </div>
          </div>

          {/* A device-readout mockup, styled after the bin's own OLED
              status screen, instead of a stock illustration — this is
              what the dashboard is actually built from. Floated over the
              photo rather than boxed beside it, so the hero stays one
              clean image with one job. */}
          <div className="absolute bottom-8 right-8 hidden w-72 rounded-xl border border-white/10 bg-[#0d120f]/90 p-4 font-mono text-[#d7f5df] shadow-2xl backdrop-blur sm:block">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 text-xs text-[#9fd6ad]">
              <span>BIN-03 · Bergkelder corner</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ff5c5c]" />
                emergency
              </span>
            </div>
            <dl className="mt-2.5 flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-[#9fd6ad]">
                  <Waves className="h-3 w-3" /> fill
                </dt>
                <dd>93%</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-[#ff8b6a]">
                  <Flame className="h-3 w-3" /> gas (raw)
                </dt>
                <dd className="text-[#ff8b6a]">890 (hazard)</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-[#9fd6ad]">
                  <Footprints className="h-3 w-3" /> traffic (10s)
                </dt>
                <dd>1</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-[#ff8b6a]">
                  <Vibrate className="h-3 w-3" /> movement
                </dt>
                <dd className="text-[#ff8b6a]">alert</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="container py-16">
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
