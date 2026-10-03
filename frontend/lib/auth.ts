// Mock session handling for the municipal dashboard login.
//
// This is deliberately NOT real authentication: one shared operator
// account checked against two env vars, with a plain (unsigned) cookie
// marking the session. That's enough to gate the demo dashboard behind a
// login screen for the weekend; swap in a real identity provider and a
// real user store before this runs anywhere that matters.
//
// Runs in both the Edge middleware and a Node route handler, so this
// file avoids Node-only APIs (no Buffer) and sticks to atob/btoa +
// TextEncoder/TextDecoder, which both runtimes provide.

export const SESSION_COOKIE = "cc_session";

export interface MockSession {
  username: string;
  issuedAt: string;
}

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeSession(session: MockSession): string {
  return toBase64Url(JSON.stringify(session));
}

export function decodeSession(value: string | undefined | null): MockSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(value)) as Partial<MockSession>;
    if (typeof parsed.username === "string" && typeof parsed.issuedAt === "string") {
      return { username: parsed.username, issuedAt: parsed.issuedAt };
    }
    return null;
  } catch {
    return null;
  }
}

// Demo defaults so judges can log in without digging through .env.local.
// Override MUNICIPAL_USERNAME / MUNICIPAL_PASSWORD in frontend/.env.local
// for anything other than the hackathon demo.
export const DEFAULT_MUNICIPAL_USERNAME = "operator";
export const DEFAULT_MUNICIPAL_PASSWORD = "corridor2026";

export function checkCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.MUNICIPAL_USERNAME ?? DEFAULT_MUNICIPAL_USERNAME;
  const expectedPass = process.env.MUNICIPAL_PASSWORD ?? DEFAULT_MUNICIPAL_PASSWORD;
  return username === expectedUser && password === expectedPass;
}
