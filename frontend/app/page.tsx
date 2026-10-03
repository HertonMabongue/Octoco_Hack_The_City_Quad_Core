import Link from "next/link";
import { ArrowRight, Camera, LayoutDashboard, Radio, Recycle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const AUDIENCES = [
  {
    href: "/dashboard",
    icon: LayoutDashboard,
    title: "Municipal dashboard",
    description:
      "For operators — live bin status on a map, fill-level trends, and an alert feed that merges sensor overflows with community reports.",
    cta: "Open dashboard",
  },
  {
    href: "/community",
    icon: Camera,
    title: "Community app",
    description:
      "For residents — see which bins near you are filling up, and report a littered area with a photo in a few taps.",
    cta: "Open community app",
  },
];

const FEATURES = [
  {
    icon: Radio,
    title: "Ultrasonic fill sensing",
    description: "Sensor nodes on corridor bins measure fill level and overflow risk, streamed every 30 seconds.",
  },
  {
    icon: LayoutDashboard,
    title: "Operator-ready alerts",
    description: "Thresholds turn raw readings into collection-ready alerts before a bin overflows, not after.",
  },
  {
    icon: Camera,
    title: "Resident reporting",
    description: "Littering and illegal dumping reports from the community land in the same feed operators already watch.",
  },
];

export default function HomePage() {
  return (
    <main>
      <section className="border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
        <div className="container flex flex-col items-center gap-6 py-20 text-center sm:py-28">
          <Badge variant="secondary" className="gap-1.5">
            <Recycle className="h-3.5 w-3.5" />
            Adam Tas Corridor · Waste &amp; Recycling
          </Badge>

          <h1 className="max-w-2xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Clean Corridor Waste Management System
          </h1>

          <p className="max-w-xl text-balance text-lg text-muted-foreground">
            Catching bin overflow and illegal dumping before they become a problem —
            live sensor data and community reports, in one place, for the people who
            keep the corridor clean.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
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
      </section>

      <section className="container py-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <feature.icon className="h-6 w-6 text-primary" />
                <CardTitle className="pt-2 text-base">{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="container pb-20">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Choose your view
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {AUDIENCES.map((audience) => (
            <Link key={audience.href} href={audience.href} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/50">
                <CardHeader>
                  <audience.icon className="h-6 w-6 text-primary" />
                  <CardTitle className="pt-2">{audience.title}</CardTitle>
                  <CardDescription>{audience.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                    {audience.cta}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
