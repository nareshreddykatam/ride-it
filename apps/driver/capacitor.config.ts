import type { CapacitorConfig } from "@capacitor/cli";

// Phase 1 (Android test build): live-server mode, not static export.
//
// Next.js Middleware (used here for auth route protection, see
// middleware.ts) cannot run under `output: "export"` — next.config.mjs
// deliberately does NOT set that, and never has since the Phase 4.5 fix
// documented there. The old webDir: "out" value in this file predated
// that decision being finalized and was explicitly flagged in a comment
// as "don't treat as correct until that decision is made" — this is that
// decision: the app ships NO local web assets at all. `server.url` below
// points the WebView directly at the deployed app; webDir is required by
// CapacitorConfig's type but is never read in this mode (no local
// `npx cap copy` step is meaningful here), so it's pointed at an existing,
// harmless directory rather than a nonexistent "out".
//
// REAL BUG FOUND AND FIXED (Android Phase 1 real-device audit): this
// previously hardcoded a ONE-OFF Preview deployment's own unique URL
// (…-mzfnzujcf-…), which Vercel deployments are immutable — that exact
// URL was permanently frozen to whatever commit was HEAD when it was
// created (`vercel inspect` confirmed: created 2026-09-08, target
// "preview") and could never reflect anything pushed after it, including
// ride-chat, speedometer/multi-offer, the Phase 1 security-audit fixes,
// and everything merged to `main` since. The installed APK was silently
// running that stale snapshot while a Chrome comparison against a fresh
// deploy (or localhost) used current code.
//
// Fixed by pointing at Vercel's own auto-updating git-branch alias for
// `main` (`<project>-git-main-<team>.vercel.app`, confirmed live via
// `vercel alias ls` / direct fetch) instead of a specific deployment's
// pinned URL — Vercel repoints this alias itself on every future push to
// `main`. Still a Preview-class Vercel URL, not a production custom
// domain (none is configured on this project) — swap this for a real
// production domain as its own separate decision when one exists.
const config: CapacitorConfig = {
  appId: "com.rideit.driver",
  appName: "Ridora Driver",
  webDir: "public",
  server: {
    url: "https://ride-it-driver-git-main-nareshreddykatams-projects.vercel.app",
    androidScheme: "https",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
