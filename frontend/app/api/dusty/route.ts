import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getAlerts, getBins, getForecast, getHotspots } from "@/lib/api";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

// Dusty: the dashboard's AI assistant. This route is the only place the
// Gemini API key is used, so it never reaches the browser. Each question
// is sent to Gemini together with a fresh snapshot of the dashboard's
// own data (bins, forecasts, alerts, hotspots), and the model is told to
// answer from that snapshot only.
//
// Set GEMINI_API_KEY in frontend/.env.local (and in Vercel's environment
// variables for the hosted site). GEMINI_MODEL is optional.

export const dynamic = "force-dynamic";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
const API_BASE = process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta";
const MAX_TURNS = 12; // most recent messages sent to the model
const MAX_CHARS = 800; // per message
const HOUR_MS = 60 * 60 * 1000;

type ChatMessage = { role: "user" | "dusty"; text: string };

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// The facts Dusty is allowed to use, as compact JSON.
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
    "You are Dusty, the assistant on Clean Corridor, a dashboard the municipal waste team uses to monitor smart bins in Stellenbosch's Adam Tas Corridor.",
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

export async function POST(request: NextRequest) {
  // Same mock session the dashboard uses, so this isn't an open proxy to
  // the Gemini API for anyone who finds the URL.
  if (!decodeSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Sign in to the dashboard to use Dusty." }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Dusty isn't set up yet: add GEMINI_API_KEY to the site's environment variables." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as { messages?: unknown } | null;
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
        system_instruction: { parts: [{ text: systemPrompt(await snapshot()) }] },
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
