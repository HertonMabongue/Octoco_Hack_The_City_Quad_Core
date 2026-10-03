import { Badge } from "@/components/ui/badge";

interface Doc {
  title: string;
  category: string;
  body: string[];
}

// Real reference content rather than linked files that don't exist yet
// in a hackathon build. Written for this corridor specifically (ties
// back to the actual alert types and thresholds elsewhere in the app),
// not generic municipal boilerplate.
const DOCS: Doc[] = [
  {
    title: "Bin collection schedule",
    category: "Operations",
    body: [
      "Standard residential collection: Mondays and Thursdays, 06:00 to 10:00.",
      "Corridor smart bins: collected on demand once a bin crosses the critical fill threshold, or on the standard schedule, whichever comes first.",
      "A bin reporting offline for more than 90 seconds is flagged for a manual check on the next scheduled run.",
    ],
  },
  {
    title: "Illegal dumping reporting procedure",
    category: "Operations",
    body: [
      "Confirm the report has a photo and a location. Reports without either still get logged, but can't be dispatched to a specific site.",
      "Dispatch within 48 hours for general waste, within 4 hours for anything flagged as hazardous.",
      "If the same site gets 3 or more reports within 30 days, escalate to the environmental health team for a standing patrol.",
    ],
  },
  {
    title: "Recycling sorting guide",
    category: "Public guidance",
    body: [
      "Paper and cardboard: flattened, dry, kept loose (not bagged).",
      "Glass: rinsed, lids removed.",
      "PET and HDPE plastics only (check the resin code on the base). Other plastics go to general waste.",
      "Recyclables placed in a plastic bag are treated as general waste by the sorting facility, so don't bag them.",
    ],
  },
  {
    title: "Hazardous gas alert response",
    category: "Safety",
    body: [
      "Triggered when a bin's gas sensor reads 800 or above on its raw scale (see GAS_ALERT_RAW in the dashboard's constants).",
      "Do not open the bin. Cordon a 3 metre radius.",
      "Contact the municipal hazmat line and log the incident with the bin ID and reading.",
      "Clear the alert on the dashboard only once the site has been inspected in person.",
    ],
  },
  {
    title: "Device maintenance checklist",
    category: "Maintenance",
    body: [
      "Monthly: check battery or solar charge level, clean the ultrasonic sensor lens, and walk past the PIR to confirm it still triggers.",
      "Confirm the bin's last-updated timestamp on the registry is under 24 hours old. If not, it's likely a connectivity or power fault, not a sensor fault.",
      "After any firmware update, verify all three operational modes (normal, maintenance, emergency) still produce distinct feedback on the device.",
    ],
  },
  {
    title: "Data retention for resident reports",
    category: "Policy",
    body: [
      "Photos and location data submitted through the community app are retained for 90 days, used only for dispatch and corridor planning.",
      "Reports are not shared outside the municipal waste team.",
      "A resident can request their report be deleted by contacting the municipality directly with their report's submission time.",
    ],
  },
];

export default function DocsAndSops() {
  return (
    <div className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card shadow-card">
      {DOCS.map((doc) => (
        <details key={doc.title} className="group p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span className="text-sm font-medium">{doc.title}</span>
            <Badge variant="outline" className="shrink-0">
              {doc.category}
            </Badge>
          </summary>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm text-muted-foreground">
            {doc.body.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted-foreground/50">&middot;</span>
                {line}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
