"use client";

import * as React from "react";

/**
 * Catches exceptions thrown by the ROOT layout itself (e.g. a provider
 * crashing during render) — the one case app/error.tsx can't catch, since
 * error.tsx is a sibling of layout.tsx, not a wrapper around it. Must
 * render its own <html>/<body>: this replaces the entire root layout,
 * inline styles only since layout.tsx's CSS imports are gone too.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error("[marketing] Unhandled root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ fontSize: 14, color: "#666" }}>Ridora ran into a problem loading this page.</p>
        <button
          onClick={reset}
          style={{
            height: 44,
            padding: "0 20px",
            borderRadius: 8,
            background: "#1E6FEF",
            color: "#fff",
            border: "none",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
