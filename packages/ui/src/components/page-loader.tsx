import { Loader2 } from "lucide-react";
import { cn } from "../lib/cn";

/**
 * Shared "something is loading" fallback for route-level Suspense
 * boundaries and Next.js loading.tsx files — never render `null`/nothing
 * here. A visible, stable loading state during a navigation gap (RSC
 * fetch, lazy chunk load) is what keeps a slow transition from reading as
 * a blank/white screen; see the passenger app's loading.tsx and the
 * white-screen-navigation root-cause fix this accompanies.
 */
export function PageLoader({ className }: { className?: string }) {
  return (
    <main className={cn("flex flex-1 flex-col items-center justify-center gap-2 py-16", className)}>
      <Loader2 size={26} className="animate-spin text-signal-blue" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </main>
  );
}
