"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@ride-it/ui";

/**
 * Development-only. Only ever rendered by page.tsx, which checks
 * RIDE_IT_E2E_TEST_MODE server-side (see that file) before including
 * this component in the tree at all -- if the flag is unset (always the
 * case in production), this component's code never reaches the client
 * bundle for that render, and no button exists in the rendered HTML.
 *
 * This component itself never touches the service-role key or the test
 * password -- it only POSTs to /api/e2e/login, which does all of that
 * server-side (packages/supabase/src/e2e.ts).
 */
export function E2ETestLoginButton({ role, homePath }: { role: "passenger" | "driver"; homePath: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/e2e/login", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "E2E login failed");
      router.push(homePath);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "E2E login failed");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-dashed border-alert-red/40 bg-alert-red/5 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-alert-red">Development only -- E2E test mode</p>
      <Button variant="outline" className="mt-2 w-full" disabled={busy} onClick={handleClick}>
        {busy ? "Signing in..." : `Sign in as E2E test ${role}`}
      </Button>
      {error && <p className="mt-2 text-xs text-alert-red">{error}</p>}
    </div>
  );
}
