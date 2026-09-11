import type { CapacitorConfig } from "@capacitor/cli";

// Phase 1 (Android test build): live-server mode, matching the Driver
// app's config and for the same reason — Next.js Middleware (auth route
// protection) cannot run under `output: "export"`, and next.config.mjs
// does not set it. The WebView loads the deployed app directly; webDir
// is required by CapacitorConfig's type but is never read in this mode,
// so it points at an existing, harmless directory.
//
// No prior Capacitor setup existed for Passenger before this — appId
// follows the same reverse-domain convention already established by the
// Driver app's existing `com.rideit.driver` (not the `in.ridora.*` form
// suggested as a fallback only, to avoid introducing a second, competing
// naming convention across the two native apps).
//
// REAL BUG FOUND AND FIXED (Android Phase 1 real-device audit): this
// previously hardcoded a ONE-OFF Preview deployment's own unique URL
// (…-ev5tioatg-…), which Vercel deployments are immutable — that exact
// URL was permanently frozen to whatever commit was HEAD when it was
// created (`vercel inspect` confirmed: created 2026-09-08, target
// "preview") and could never reflect anything pushed after it, including
// the entire ride-chat, speedometer/multi-offer, map-search-routing, the
// Phase 1 security-audit fixes, and this repo's own map-pickup-edit
// feature — all merged to `main` afterward. The installed APK was
// silently running that 3-day-stale snapshot while any Chrome comparison
// against a fresh deploy (or localhost) used current code — the direct
// mechanism behind "some features do not work / differ from the browser."
//
// Fixed by pointing at Vercel's own auto-updating git-branch alias for
// `main` (`<project>-git-main-<team>.vercel.app`, confirmed live via
// `vercel alias ls` / direct fetch) instead of a specific deployment's
// pinned URL — this alias is repointed by Vercel itself on every future
// push to `main`, so the APK now tracks `main` the same way a browser
// hitting a fresh deployment already does. Still a Preview-class Vercel
// URL, not a production custom domain (none is configured on this
// project) — swap this for a real production domain as its own separate
// decision when one exists, rather than editing app logic for it.
const config: CapacitorConfig = {
  appId: "com.rideit.passenger",
  appName: "Ridora",
  webDir: "public",
  server: {
    url: "https://ride-it-passenger-git-main-nareshreddykatams-projects.vercel.app",
    androidScheme: "https",
  },
};

export default config;
