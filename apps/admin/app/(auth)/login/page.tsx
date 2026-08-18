"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { signInAdminWithPassword } from "@ride-it/auth";

function AdminLoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(
    searchParams.get("error") === "wrong_app"
      ? "That account isn't an admin account."
      : null
  );

  const isValid = /\S+@\S+\.\S+/.test(email) && password.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setSubmitting(true);
    setError(null);
    try {
      await signInAdminWithPassword(supabase, email, password);
      router.push("/overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in. Check your details and try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col lg:flex-row">
      {/* Brand panel — desktop only. Flat ink-blue fill, not a gradient —
          this is an internal ops tool, not a marketing hero surface. */}
      <div className="hidden bg-ink-blue px-12 py-16 lg:flex lg:w-[45%] lg:flex-col lg:justify-between">
        <div>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white">
            <ShieldCheck size={22} />
          </span>
          <p className="mt-6 font-display text-2xl font-medium text-white">Ride It</p>
          <p className="text-sm font-medium uppercase tracking-wide text-white/70">Admin Console</p>
        </div>
        <div>
          <p className="font-display text-xl font-medium leading-snug text-white">
            Operations command center for drivers, rides, and revenue.
          </p>
          <p className="mt-3 max-w-sm text-sm text-white/70">
            Verification, live ride monitoring, safety response, and platform configuration — all in one restricted,
            audited console.
          </p>
        </div>
        <p className="text-xs text-white/50">Access restricted to provisioned admin accounts.</p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-paper px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-blue text-white">
              <ShieldCheck size={18} />
            </span>
            <div>
              <p className="font-display text-sm font-medium text-ink-blue">Ride It</p>
              <p className="text-xs text-ink-soft">Admin Console</p>
            </div>
          </div>

          <h1 className="font-display text-2xl font-medium text-ink">Admin sign in</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Sign in with your admin email and password.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
                Email
              </label>
              <div className="flex items-center rounded-lg border border-border bg-surface shadow-sm focus-within:border-signal-blue focus-within:ring-2 focus-within:ring-signal-blue/20">
                <input
                  id="email"
                  type="email"
                  autoFocus
                  autoComplete="email"
                  placeholder="you@rideit.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-14 w-full bg-transparent px-4 text-sm text-ink outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
                Password
              </label>
              <div className="flex items-center rounded-lg border border-border bg-surface shadow-sm focus-within:border-signal-blue focus-within:ring-2 focus-within:ring-signal-blue/20">
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-14 w-full bg-transparent px-4 text-sm text-ink outline-none"
                />
              </div>
            </div>

            {error && <p className="text-xs text-alert-red">{error}</p>}

            <Button type="submit" variant="primary" className="mt-2 w-full" disabled={!isValid || submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}

// useSearchParams() requires a Suspense boundary in the Next.js App Router.
export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginPageContent />
    </Suspense>
  );
}
