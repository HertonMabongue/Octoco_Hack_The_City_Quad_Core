"use client";

import { useState, type ChangeEvent } from "react";
import { Camera } from "lucide-react";

import { Label } from "@/components/ui/label";

// A simple file input with a preview. Keeps image handling in one place
// so ReportForm stays focused on the overall submit flow.
export default function PhotoUpload({ onSelect }: { onSelect: (file: File) => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    onSelect(file);
  }

  return (
    <div>
      <Label htmlFor="photo" className="mb-1.5 block">
        Photo of the littered area
      </Label>
      <p className="mb-2 text-xs text-muted-foreground">
        Frame the litter, not people: avoid faces and number plates.
      </p>
      <label
        htmlFor="photo"
        className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-input px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
      >
        <Camera className="h-4 w-4" />
        {previewUrl ? "Change photo" : "Take or choose a photo"}
      </label>
      <input
        id="photo"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="sr-only"
      />
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Preview of the report photo"
          className="mt-3 max-w-full rounded-md border border-border"
        />
      )}
    </div>
  );
}
