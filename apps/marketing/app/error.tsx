"use client";

import * as React from "react";
import { Button } from "@ride-it/ui";

/**
 * Root-segment error boundary. Without this, an uncaught render exception
 * anywhere under the root layout unmounts the whole tree with nothing to
 * replace it — a permanent blank/white page until the user manually
 * reloads. This does NOT fix the underlying exception; it only gives the
 * visitor a way back instead of a dead screen. `reset()` re-renders the
 * segment (useful for transient failures); "Go to Home" is the fallback
 * for anything reset() can't clear on its own.
 */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error("[marketing] Unhandled render error:", error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <h1 className="font-display text-xl font-semibold text-ink">Something went wrong</h1>
      <p className="text-sm text-ink-soft">This page ran into a problem. You can try again, or head back to Home.</p>
      <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
        <Button className="w-full" onClick={reset}>
          Try again
        </Button>
        <Button variant="outline" className="w-full" onClick={() => (window.location.href = "/")}>
          Go to Home
        </Button>
      </div>
    </main>
  );
}
