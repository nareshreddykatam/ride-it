import type { CapacitorConfig } from "@capacitor/cli";

// Phase 1 (Android test build): live-server mode, matching the Driver
// app's config and for the same reason — Next.js Middleware (auth route
// protection) cannot run under `output: "export"`, and next.config.mjs
// does not set it. The WebView loads the deployed Preview deployment
// directly; webDir is required by CapacitorConfig's type but is never
// read in this mode, so it points at an existing, harmless directory.
//
// No prior Capacitor setup existed for Passenger before this — appId
// follows the same reverse-domain convention already established by the
// Driver app's existing `com.rideit.driver` (not the `in.ridora.*` form
// suggested as a fallback only, to avoid introducing a second, competing
// naming convention across the two native apps).
//
// Phase 1 test target only — NOT the production custom domain (no
// custom domain is even configured on this Vercel project yet — checked
// directly). Confirmed directly reachable without Vercel's Preview
// Deployment Protection wall during an earlier browser smoke test.
const config: CapacitorConfig = {
  appId: "com.rideit.passenger",
  appName: "Ridora",
  webDir: "public",
  server: {
    url: "https://ride-it-passenger-ev5tioatg-nareshreddykatams-projects.vercel.app",
    androidScheme: "https",
  },
};

export default config;
