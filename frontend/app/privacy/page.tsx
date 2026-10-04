import type { Metadata } from "next";

import Footer from "@/components/layout/Footer";
import Navbar from "@/components/layout/Navbar";
import { API_HEADERS, API_TIMEOUT_MS, API_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "What Streetwise collects when you report littering, why, and when it is deleted.",
};

interface Policy {
  photoRetentionResolvedHours: number;
  photoRetentionOpenDays: number;
  reportRetentionDays: number;
  readingsRetentionDays: number;
  coordinateDecimals: number;
}

// Mirrors the backend's defaults (backend/app/config.py) — used only if the
// live policy can't be fetched. The backend is the source of truth.
const DEFAULT_POLICY: Policy = {
  photoRetentionResolvedHours: 24,
  photoRetentionOpenDays: 30,
  reportRetentionDays: 365,
  readingsRetentionDays: 90,
  coordinateDecimals: 4,
};

async function getPolicy(): Promise<Policy> {
  try {
    const res = await fetch(`${API_URL}/api/privacy/policy`, {
      headers: API_HEADERS,
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Policy;
  } catch {
    return DEFAULT_POLICY;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default async function PrivacyPage() {
  const p = await getPolicy();
  const metres = Math.round(111_000 / 10 ** p.coordinateDecimals);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main id="main-content" className="container max-w-2xl flex-1 py-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Privacy notice</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How Streetwise handles what you send when you report littering, in plain language. This is
          a hackathon prototype; it is built to the principles of South Africa&apos;s Protection of
          Personal Information Act (POPIA), but has not been certified or registered.
        </p>

        <Section title="No account, no name">
          <p>
            You do not log in to report. We do not ask for or store your name, email address, phone
            number or device identifier.
          </p>
        </Section>

        <Section title="What we collect">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Your photo</strong>, with all hidden data (GPS
              position, phone model, timestamps) removed before it is saved.
            </li>
            <li>
              <strong className="text-foreground">Location</strong>, rounded to about {metres} m so
              it shows where the litter is but not exactly where you stood.
            </li>
            <li>
              <strong className="text-foreground">Your note</strong>, if you write one (500
              characters at most).
            </li>
            <li>
              <strong className="text-foreground">What kind of waste it shows</strong>, decided
              automatically by an image model. No person is identified or scored.
            </li>
          </ul>
          <p>
            Your network address is used for a few minutes in memory only, to stop one connection
            flooding the form. It is not saved.
          </p>
        </Section>

        <Section title="Why, and who sees it">
          <p>
            Only to get the litter cleaned up and to show the municipality where it keeps happening.
            Reports are seen by the municipal operations team through the dashboard. They are not
            sold, shared for marketing, or used to identify or fine anyone.
          </p>
          <p>
            Please keep people out of the frame: we cannot guarantee a stranger&apos;s face or a
            number plate is never captured by accident, which is why photos are deleted quickly.
          </p>
        </Section>

        <Section title="How long we keep it">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Photo:</strong> deleted{" "}
              {p.photoRetentionResolvedHours} hours after the report is resolved, or after{" "}
              {p.photoRetentionOpenDays} days if it is never resolved. A photo with no waste in it
              is deleted immediately.
            </li>
            <li>
              <strong className="text-foreground">Your note:</strong> erased together with the photo
              once the report is resolved.
            </li>
            <li>
              <strong className="text-foreground">The anonymous record</strong> (rounded location,
              waste type, date) is kept {p.reportRetentionDays} days to spot hotspots, then deleted.
            </li>
          </ul>
          <p>
            The bins themselves collect no images or audio. Their motion sensor only counts that
            something moved nearby ({p.readingsRetentionDays}-day retention), and cannot tell who.
          </p>
        </Section>

        <Section title="Taking it back">
          <p>
            Straight after you submit, the confirmation includes a <em>Delete my report</em> button
            that removes the report and photo at once. Because we do not know who you are, that
            button is the only way we can link a report to you, so use it before closing the page.
          </p>
          <p>
            If you or someone else appears in a photo and you want it removed, contact the
            municipality&apos;s Information Officer; contact details will be published here before
            any public launch.
          </p>
        </Section>

        <Section title="Where it lives">
          <p>
            Photos and reports are stored on the Streetwise server, not in this website&apos;s
            hosting. The website is hosted on Vercel, which may process page requests outside South
            Africa; it does not receive your photo.
          </p>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
