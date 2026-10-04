import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Recycle } from "lucide-react";

import LoginForm from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Municipal login",
  description: "Sign in to the Streetwise municipal dashboard.",
  robots: { index: false, follow: false },
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { from?: string };
}) {
  return (
    <main className="bg-grid-dots flex min-h-screen items-center justify-center bg-[#0d120f] p-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-background p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Recycle className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Streetwise
            </div>
            <h1 className="font-display text-lg font-semibold leading-tight">Municipal access</h1>
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
