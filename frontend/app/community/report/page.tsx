import type { Metadata } from "next";

import ReportForm from "@/components/community/ReportForm";

export const metadata: Metadata = {
  title: "Report littering",
  description: "Report a littered area along the Adam Tas Corridor with a photo and your location.",
};

export default function ReportPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Report a littered area</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A photo and your location help the municipal team act on it faster.
      </p>
      <div className="mt-6">
        <ReportForm />
      </div>
    </div>
  );
}
