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

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your profile, notification preferences, and who else has dashboard access.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team access</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="divide-y divide-border">
            {TEAM.map((member) => (
              <li key={member.name} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="flex items-center gap-2">
                  {member.active && <ShieldCheck className="h-3.5 w-3.5 text-status-good" />}
                  <div>
                    <div className="font-medium">{member.name}</div>
                    <div className="text-xs text-muted-foreground">{member.access}</div>
                  </div>
                </div>
                <Badge variant="secondary">{member.role}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
