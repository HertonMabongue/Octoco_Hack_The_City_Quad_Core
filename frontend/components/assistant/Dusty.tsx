"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Send, X } from "lucide-react";

import { cn } from "@/lib/utils";

type ChatMessage = { role: "user" | "dusty"; text: string };

type Audience = "operator" | "resident";

// What Dusty offers depends on where he is: the waste team's dashboard,
// or the public home page and community app.
const COPY: Record<Audience, { subtitle: string; intro: string; starters: string[] }> = {
  operator: {
    subtitle: "Ask about bins, collections and hotspots",
    intro: "I answer from this dashboard's live data. Try one of these:",
    starters: [
      "Which bin should be collected first?",
      "Are there any open alerts?",
      "Where should we add a bin?",
    ],
  },
  resident: {
    subtitle: "Ask about bins, recycling and reporting litter",
    intro: "I can help you find a bin, recycle right or report litter. Try one of these:",
    starters: ["Which bin has space right now?", "Can I recycle a pizza box?", "How do I report litter?"],
  },
};

// Dusty's broom. Drawn inline so it takes the button's text colour.
function Broom({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <path d="M24 3.5 15.2 16.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="m11.4 14.6 7.2 4.8-1.7 2.6-7.2-4.8z" fill="currentColor" />
      <path d="m9.2 18 6.6 4.4-3.4 6.6L3.6 23z" fill="currentColor" opacity="0.8" />
      <path
        d="m6.9 21.6-1.5 2.5M9.7 22.4l-1.9 3.4M12.5 23.6 10.6 27"
        stroke="hsl(var(--primary))"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Dusty: the site's AI assistant. A broom button fixed to the
// bottom-right of every page (mounted once in app/layout.tsx); it sweeps
// when clicked and opens a small chat panel. On the dashboard he helps
// the waste team; everywhere else he helps residents. Questions go to
// /api/dusty, which holds the Gemini API key and decides what data each
// audience may see, so neither the key nor operator data reaches a
// resident's browser.
export default function Dusty() {
  const pathname = usePathname();
  const audience: Audience = pathname.startsWith("/dashboard") ? "operator" : "resident";
  const copy = COPY[audience];
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const broom = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  // The sweep: a few quick swings, pivoting near the top of the handle.
  // Skipped for anyone who has asked their device for reduced motion.
  function sweep() {
    const el = broom.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { transform: "rotate(0deg)" },
        { transform: "rotate(-24deg)" },
        { transform: "rotate(16deg)" },
        { transform: "rotate(-16deg)" },
        { transform: "rotate(10deg)" },
        { transform: "rotate(0deg)" },
      ],
      { duration: 700, easing: "ease-in-out" }
    );
  }

  function toggle() {
    sweep();
    setOpen((value) => !value);
  }

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // Start a fresh conversation when moving between the dashboard and the
  // public pages, so operator answers never linger on a public page.
  useEffect(() => {
    setMessages([]);
    setError(null);
  }, [audience]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", text }];
    setMessages(next);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/dusty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, audience }),
      });
      const data = (await res.json().catch(() => null)) as { reply?: string; error?: string } | null;
      if (res.ok && data?.reply) {
        setMessages([...next, { role: "dusty", text: data.reply }]);
      } else {
        setError(data?.error ?? "Dusty couldn't answer. Try again in a moment.");
      }
    } catch {
      setError("Dusty couldn't be reached. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <section
          role="dialog"
          aria-label="Dusty, the Streetwise assistant"
          className="flex h-[28rem] max-h-[70vh] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-card"
        >
          <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <h2 className="font-display text-sm font-semibold">Dusty</h2>
              <p className="text-xs text-muted-foreground">{copy.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Dusty"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div ref={log} aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-muted-foreground">{copy.intro}</p>
                {copy.starters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => ask(starter)}
                    className="block w-full rounded-md border border-border/60 px-3 py-2 text-left hover:bg-accent/50"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            )}
            {messages.map((message, index) => (
              <p
                key={index}
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2",
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-secondary text-foreground"
                )}
              >
                {message.text}
              </p>
            ))}
            {busy && <p className="text-muted-foreground">Dusty is checking the bins.</p>}
            {error && <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-status-critical">{error}</p>}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              ask(draft);
            }}
            className="flex items-center gap-2 border-t border-border/60 p-3"
          >
            <label htmlFor="dusty-question" className="sr-only">
              Question for Dusty
            </label>
            <input
              id="dusty-question"
              ref={input}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask Dusty a question"
              maxLength={800}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Send question"
              className="rounded-md bg-primary p-2 text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? "Close Dusty, the assistant" : "Ask Dusty, the assistant"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span ref={broom} className="block h-8 w-8" style={{ transformOrigin: "74% 12%" }}>
          <Broom className="h-8 w-8" />
        </span>
      </button>
    </div>
  );
}
