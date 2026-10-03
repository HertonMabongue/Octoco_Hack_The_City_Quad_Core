"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const STORAGE_KEY = "cc_notification_prefs";

interface Prefs {
  emailCritical: boolean;
  smsOffline: boolean;
  weeklySummary: boolean;
}

const DEFAULT_PREFS: Prefs = {
  emailCritical: true,
  smsOffline: false,
  weeklySummary: true,
};

const TOGGLES: Array<{ key: keyof Prefs; label: string; hint: string }> = [
  {
    key: "emailCritical",
    label: "Email on critical alerts",
    hint: "Overflow, gas hazard, or tamper events",
  },
  {
    key: "smsOffline",
    label: "SMS when a bin goes offline",
    hint: "Sent once a device misses its reporting window",
  },
  {
    key: "weeklySummary",
    label: "Weekly summary report",
    hint: "Fill trends and collection counts, every Monday",
  },
];

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

// Notification settings for the signed-in operator. There's no real
// email/SMS delivery behind this yet (no user store to send to, see
// lib/auth.ts), so this persists to localStorage rather than a backend
// call — it's the operator's own device remembering their choice, which
// is exactly what a preference toggle should do even once a real
// notification service exists behind it.
export default function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  function toggle(key: keyof Prefs) {
    setPrefs((current) => {
      const next = { ...current, [key]: !current[key] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // localStorage can throw in private browsing — the toggle still
        // works for the rest of this session, it just won't persist.
      }
      return next;
    });
  }

  return (
    <ul className="divide-y divide-border">
      {TOGGLES.map((item) => {
        const checked = prefs[item.key];
        return (
          <li key={item.key} className="flex items-center justify-between gap-4 py-3">
            <div>
              <span id={`${item.key}-label`} className="text-sm font-medium">
                {item.label}
              </span>
              <p className="text-xs text-muted-foreground">{item.hint}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={checked}
              aria-labelledby={`${item.key}-label`}
              data-state={checked ? "checked" : "unchecked"}
              onClick={() => toggle(item.key)}
              className={cn(
                "group relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
                checked ? "border-primary bg-primary" : "border-input bg-secondary"
              )}
            >
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 rounded-full bg-background shadow transition-transform",
                  checked ? "translate-x-4" : "translate-x-1"
                )}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
