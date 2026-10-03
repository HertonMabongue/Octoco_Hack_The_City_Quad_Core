import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ShieldCheck } from "lucide-react";

import LogoutButton from "@/components/auth/LogoutButton";
import NotificationPreferences from "@/components/dashboard/NotificationPreferences";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Account",
  description: "Operator profile, notification preferences, and team access.",
};

// Static for this build — there's one real login (see lib/auth.ts), so
// "the team" is shown rather than managed. Swap for a real roster once
// there's a user store behind the login to manage.
const TEAM = [
  { name: "You", role: "Operator", access: "Full dashboard access", active: true },
  { name: "T. Mahlangu", role: "Admin", access: "Full dashboard access + device registry", active: false },
  { name: "S. van Wyk", role: "Viewer", access: "Read-only, no alert resolution", active: false },
];

export default function AccountPage() {
  const session = decodeSession(cookies().get(SESSION_COOKIE)?.value);
  const username = session?.username ?? "operator";
  const lastSignIn = session ? new Date(session.issuedAt).toLocaleString() : "unknown";

  const initials = username.slice(0, 2).toUpperCase();

  return (
    <div className="max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your profile, notification preferences, and who else has dashboard access.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-sm font-semibold text-primary-foreground">
                {initials}
              </span>
              <div>
                <CardTitle className="text-base">Profile</CardTitle>
                <p className="text-xs text-muted-foreground">Municipal Operator</p>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Operator ID</dt>
                  <dd className="mt-0.5 font-mono text-sm">{username}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Role</dt>
                  <dd className="mt-0.5 text-sm">Municipal Operator</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Department</dt>
                  <dd className="mt-0.5 text-sm">Stellenbosch Waste &amp; Recycling</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Signed in since</dt>
                  <dd className="mt-0.5 font-mono text-sm">{lastSignIn}</dd>
                </div>
              </dl>
              <div className="mt-4">
                <LogoutButton className="px-0" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notifications</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <NotificationPreferences />
            </CardContent>
          </Card>
        </div>

        <Card className="lg:self-start">
          <CardHeader>
            <CardTitle className="text-base">Team access</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-border">
              {TEAM.map((member) => (
                <li key={member.name} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div className="flex items-start gap-2">
                    {member.active && (
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-good" />
                    )}
                    <div>
                      <div className="font-medium">{member.name}</div>
                      <div className="text-xs text-muted-foreground">{member.access}</div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {member.role}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
