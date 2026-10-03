"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_MUNICIPAL_USERNAME, DEFAULT_MUNICIPAL_PASSWORD } from "@/lib/auth";

// Signs in against /api/mock-auth, which sets the session cookie
// middleware.ts checks on every /dashboard request. On success, sends
// the operator back wherever they were headed (the "from" query param
// middleware attaches on redirect), or /dashboard by default.
export default function LoginForm({ from }: { from?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/mock-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Incorrect username or password.");
        setSubmitting(false);
        return;
      }
      router.push(from && from.startsWith("/dashboard") ? from : "/dashboard");
      router.refresh();
    } catch {
      setError("Couldn't reach the login service. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div>
        <Label htmlFor="username" className="mb-1.5 block">
          Operator ID
        </Label>
        <Input
          id="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="password" className="mb-1.5 block">
          Passcode
        </Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={submitting} className="mt-1">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        {submitting ? "Checking..." : "Sign in"}
      </Button>

      <p className="rounded-md border border-dashed border-input bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Demo access for this build: <code className="font-mono">{DEFAULT_MUNICIPAL_USERNAME}</code>{" "}
        / <code className="font-mono">{DEFAULT_MUNICIPAL_PASSWORD}</code>.
      </p>
    </form>
  );
}
