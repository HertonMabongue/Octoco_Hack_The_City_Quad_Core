"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitReport } from "@/lib/api";

import PhotoUpload from "./PhotoUpload";

type Status = "idle" | "locating" | "submitting" | "done" | "error";

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
      await submitReport({ lat: coords?.lat, lng: coords?.lng, note, photo });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-status-good/30 bg-status-good/10 p-4 text-sm">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-status-good" />
        <p>Thanks, your report was submitted and will show up on the municipal dashboard.</p>
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
      </div>

      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting" && <Loader2 className="h-4 w-4 animate-spin" />}
        {status === "submitting" ? "Submitting…" : "Submit report"}
      </Button>

      {status === "error" && (
        <p className="text-sm text-destructive">Something went wrong. Try again.</p>
      )}
    </form>
  );
}
