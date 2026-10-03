import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE, checkCredentials, encodeSession } from "@/lib/auth";

// Mock sign-in/sign-out for the municipal dashboard. See lib/auth.ts for
// why this is intentionally not real authentication.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || !password || !checkCredentials(username, password)) {
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, username });
  response.cookies.set(
    SESSION_COOKIE,
    encodeSession({ username, issuedAt: new Date().toISOString() }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8, // 8 hours — comfortably longer than one demo slot
    }
  );
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
