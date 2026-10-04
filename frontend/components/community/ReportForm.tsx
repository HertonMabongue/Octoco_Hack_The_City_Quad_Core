"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, MapPin, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitReport, withdrawReport } from "@/lib/api";
import type { ReportResult } from "@/lib/types";

import PhotoUpload from "./PhotoUpload";

type Status = "idle" | "locating" | "submitting" | "done" | "withdrawn" | "rejected" | "error";

interface Coords {
  lat: number;
  lng: number;
}

// Lets a resident report a littered area: a photo, an optional note,
// and their current location (via the browser's geolocation API).
export default function ReportForm() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ReportResult | null>(null);
  const [consent, setConsent] = useState(false);

  function captureLocation() {
    if (!navigator.geolocation) return;
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("idle");
      },
      () => setStatus("idle"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    try {
      const outcome = await submitReport({ lat: coords?.lat, lng: coords?.lng, note, photo });
      setResult(outcome);
      setStatus(outcome.status === "rejected" ? "rejected" : "done");
    } catch {
      setStatus("error");
    }
  }

  async function handleWithdraw() {
    if (!result?.withdrawToken) return;
    const ok = await withdrawReport(result.id, result.withdrawToken);
    setStatus(ok ? "withdrawn" : "error");
  }

  if (status === "withdrawn") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-4 text-sm">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <p>Your report and photo have been deleted.</p>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-status-good/30 bg-status-good/10 p-4 text-sm">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-status-good" />
        <p>
          Thanks, your report was submitted and will show up on the municipal dashboard.
          {result?.wasteLabel && <> It looks like: {result.wasteLabel}.</>}
          {result?.message && <> {result.message}</>}
          {result?.withdrawToken && (
            <>
              {" "}
              Sent it by mistake?{" "}
              <button
                type="button"
                onClick={handleWithdraw}
                className="underline underline-offset-2"
              >
                Delete my report
              </button>
              . This is only possible from this screen.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-md gap-5">
      <PhotoUpload onSelect={setPhoto} />

      <div>
        <Label htmlFor="note" className="mb-1.5 block">
          What&apos;s going on? (optional)
        </Label>
        <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </div>

      <div>
        <Button
          type="button"
          variant="outline"
          onClick={captureLocation}
          disabled={status === "locating"}
        >
          <MapPin className="h-4 w-4" />
          {coords ? "Location captured" : status === "locating" ? "Locating…" : "Use my location"}
        </Button>
        {!coords && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Without a location (or a geotagged photo) the report can&apos;t appear on the hotspot
            map.
          </p>
        )}
      </div>

      <div className="flex items-start gap-2">
        <input
          id="consent"
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-primary"
        />
        <Label
          htmlFor="consent"
          className="text-xs font-normal leading-relaxed text-muted-foreground"
        >
          I understand my photo and approximate location are shared with the municipal team to deal
          with this report, and are deleted afterwards. I won&apos;t include people&apos;s faces or
          personal details. No account or name is collected.{" "}
          <Link href="/privacy" className="underline underline-offset-2" target="_blank">
            Privacy notice
          </Link>
        </Label>
      </div>

      <Button type="submit" disabled={status === "submitting" || !consent}>
        {status === "submitting" && <Loader2 className="h-4 w-4 animate-spin" />}
        {status === "submitting" ? "Submitting…" : "Submit report"}
      </Button>

      {status === "rejected" && (
        <div className="flex items-start gap-3 rounded-xl border border-status-warning/30 bg-status-warning/10 p-4 text-sm">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-status-warning" />
          <p>{result?.message ?? "No waste found in this photo, so the report wasn't added."}</p>
        </div>
      )}

      {status === "error" && (
        <p className="text-sm text-destructive">Something went wrong. Try again.</p>
      )}
    </form>
  );
}
