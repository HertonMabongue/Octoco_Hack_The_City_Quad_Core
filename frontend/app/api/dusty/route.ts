import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getAlerts, getBins, getForecast, getHotspots } from "@/lib/api";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

// Dusty: the site's AI assistant. This route is the only place the Gemini
// API key is used, so it never reaches the browser. Each question is sent
// to Gemini together with a fresh snapshot of the site's own data, and
// the model is told to answer from that snapshot.
//
// Two audiences, decided here on the server (never trusted from the
// browser alone):
//   operator  signed in to the dashboard: bins, forecasts, alerts, hotspots
//   resident  everyone else (home page, community app): public bin
//             status and recycling guidance only, no operational data
//
// Set GEMINI_API_KEY in the repo-root .env (and in Vercel's environment
// variables for the hosted site). GEMINI_MODEL is optional.

export const dynamic = "force-dynamic";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
const API_BASE = process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta";
const MAX_TURNS = 12; // most recent messages sent to the model
const MAX_CHARS = 800; // per message
const HOUR_MS = 60 * 60 * 1000;

type ChatMessage = { role: "user" | "dusty"; text: string };
type Audience = "operator" | "resident";

// A small brake on the public endpoint so one visitor can't burn through
// the Gemini quota. Kept in memory, so it is per server instance: enough
// for a demo, not a substitute for real rate limiting.
const WINDOW_MS = 5 * 60 * 1000;
const LIMITS: Record<Audience, number> = { operator: 60, resident: 15 };
const recentRequests = new Map<string, number[]>();

function allow(key: string, limit: number): boolean {
  const now = Date.now();
  const recent = (recentRequests.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    recentRequests.set(key, recent);
    return false;
  }
  recent.push(now);
  recentRequests.set(key, recent);
  return true;
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// What a resident may ask about: public bin status only. No alerts,
// sensor readings, forecasts or hotspot recommendations.
async function residentSnapshot() {
  const bins = await getBins();
  return {
    timeNow: clock(Date.now()),
    bins: bins.map((b) => ({ name: b.label, fillPct: Math.round(b.fillPct), status: b.status })),
    howToReportLitter: "Use the Report page of the community app (/community/report): add a photo and a location.",
  };
}

// The facts Dusty is allowed to use for the waste team, as compact JSON.
async function snapshot() {
  const [bins, forecast, alerts, hotspots] = await Promise.all([
    getBins(),
    getForecast(),
    getAlerts(),
    getHotspots(),
  ]);

  return {
    timeNow: clock(Date.now()),
    bins: bins.map((b) => ({
      name: b.label,
      fillPct: Math.round(b.fillPct),
      status: b.status,
      mode: b.mode,
      connection: b.connection,
      peopleCountLastWindow: b.peopleCount ?? null,
      gasReading: b.gasRaw ?? null,
    })),
    collectionForecast: forecast.map((f) => {
      const from = f.lastReadingAt ? Date.parse(f.lastReadingAt) : null;
      const at = (hours: number | null) =>
        from !== null && hours !== null ? clock(from + hours * HOUR_MS) : null;
      return {
        bin: f.label,
        status: f.status,
        collectBy: at(f.predictedLowHours),
        expectedAtThreshold: at(f.predictedFullInHours),
        latestLikely: at(f.predictedHighHours),
        visitsPerHour: f.visitsPerHour,
      };
    }),
    openAlerts: alerts
      .filter((a) => !a.resolved)
      .slice(0, 15)
      .map((a) => ({ type: a.type, message: a.message, at: clock(Date.parse(a.createdAt)) })),
    litterHotspots: {
      totalReports: hotspots.summary.reports,
      problemAreas: hotspots.hotspots.map((h) => ({
        reports: h.count,
        mainWaste: h.dominantLabel,
        recommendation: h.title,
        why: h.reason,
      })),
    },
  };
}

function systemPrompt(data: unknown): string {
  return [
    "You are Dusty, the assistant on Streetwise, a dashboard the municipal waste team uses to monitor smart bins in Stellenbosch's Adam Tas Corridor.",
    "Answer using only the DATA below. If the DATA does not contain the answer, say you don't have that information. Never invent bins, numbers, times or locations.",
    "Keep answers short: one to four sentences, or a short list. Plain text only, no markdown.",
    "Times are in South African time (24-hour). 'collectBy' is the early end of the forecast range and is the time to schedule collection by. A forecast status of not_enough_data or not_filling means there is no forecast for that bin yet.",
    "Forecasts are estimates, so say 'about' or give the range when it matters.",
    "If asked something unrelated to waste, bins, collections, recycling or this dashboard, say that is outside what you can help with.",
    "",
    "DATA:",
    JSON.stringify(data),
  ].join("\n");
}

function residentPrompt(data: unknown): string {
  return [
    "You are Dusty, the friendly assistant on Streetwise, a waste and recycling site for residents of Stellenbosch's Adam Tas Corridor.",
    "You help with three things: which public bins have space (from the DATA below), how to report litter or dumping, and general guidance on what can be recycled.",
    "For bin questions use only the DATA. Never invent bins, fill levels or locations. A bin with status 'critical' is full or nearly full.",
    "For recycling questions give short, general guidance, and say that local rules can differ, so the municipality's own guidance takes priority.",
    "Keep answers short: one to four sentences, or a short list. Plain text only, no markdown. Times are South African time (24-hour).",
    "You have no information about alerts, sensors, collection schedules or municipal operations. If asked, say that is only available to the waste team.",
    "If asked something unrelated to waste, bins, recycling or reporting litter, say that is outside what you can help with.",
    "",
    "DATA:",
    JSON.stringify(data),
  ].join("\n");
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Dusty isn't set up yet: add GEMINI_API_KEY to the site's environment variables." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    messages?: unknown;
    audience?: unknown;
  } | null;

  // Operator mode needs both the dashboard asking for it and a valid
  // dashboard session. Anything else gets the resident view.
  const signedIn = Boolean(decodeSession(request.cookies.get(SESSION_COOKIE)?.value));
  const audience: Audience = body?.audience === "operator" && signedIn ? "operator" : "resident";

  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(`${audience}:${visitor}`, LIMITS[audience])) {
    return NextResponse.json(
      { error: "Dusty needs a short break. Try again in a few minutes." },
      { status: 429 }
    );
  }
  const messages: ChatMessage[] = Array.isArray(body?.messages)
    ? (body.messages as ChatMessage[])
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "dusty") &&
            typeof m.text === "string" &&
            m.text.trim() !== ""
        )
        .slice(-MAX_TURNS)
        .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_CHARS) }))
    : [];

  // The conversation must start and end with the user's turn.
  while (messages.length && messages[0]?.role !== "user") messages.shift();
  if (messages.at(-1)?.role !== "user") {
    return NextResponse.json({ error: "Ask Dusty a question first." }, { status: 400 });
  }

  let reply = "";
  try {
    const res = await fetch(`${API_BASE}/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text:
                audience === "operator"
                  ? systemPrompt(await snapshot())
                  : residentPrompt(await residentSnapshot()),
            },
          ],
        },
        contents: messages.map((m) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.text }],
        })),
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`[dusty] Gemini returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return NextResponse.json(
        { error: "Dusty couldn't reach the AI service. Try again in a moment." },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    reply = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();
  } catch (err) {
    console.warn("[dusty] request failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Dusty couldn't reach the AI service. Try again in a moment." },
      { status: 502 }
    );
  }

  if (!reply) {
    return NextResponse.json(
      { error: "Dusty didn't have an answer for that. Try rephrasing the question." },
      { status: 502 }
    );
  }
  return NextResponse.json({ reply });
}
