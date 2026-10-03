import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Recycle } from "lucide-react";

import LoginForm from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Municipal login",
  description: "Sign in to the Clean Corridor municipal dashboard.",
  robots: { index: false, follow: false },
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { from?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d120f] p-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-background p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
            <Recycle className="h-5 w-5 text-primary" />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Clean Corridor
            </div>
            <h1 className="text-lg font-semibold leading-tight">Municipal access</h1>
          </div>
        </div>

        <LoginForm from={searchParams.from} />

        <Link
          href="/"
          className="mt-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>
      </div>
    </main>
  );
}
