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
// points the WebView directly at the deployed Preview deployment; webDir
// is required by CapacitorConfig's type but is never read in this mode
// (no local `npx cap copy` step is meaningful here), so it's pointed at
// an existing, harmless directory rather than a nonexistent "out".
//
// Phase 1 test target only — NOT the production custom domain. Point
// this at whichever deployment you're testing against for this phase;
// swap it for a different Preview URL (or eventually a production one,
// as its own separate decision) rather than editing app logic.
const config: CapacitorConfig = {
  appId: "com.rideit.driver",
  appName: "Ridora Driver",
  webDir: "public",
  server: {
    // Confirmed directly reachable without hitting Vercel's Preview
    // Deployment Protection wall (unlike the Admin/Marketing Preview
    // projects, which do have it enabled) during an earlier browser
    // smoke test — no bypass/secret needed for this URL.
    url: "https://ride-it-driver-mzfnzujcf-nareshreddykatams-projects.vercel.app",
    androidScheme: "https",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
