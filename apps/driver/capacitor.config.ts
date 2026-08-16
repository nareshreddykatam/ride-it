import type { CapacitorConfig } from "@capacitor/cli";

// NOTE (Phase 4.5): webDir: "out" assumes a static-export build, which was
// removed from next.config.mjs this phase (conflicted with Middleware —
// see that file's comment). This config is otherwise unused so far (no
// `cap add` has been run, no ios/android project exists) — when the native
// build is actually set up, decide between Capacitor's live-server mode
// (server.url pointing at a deployed URL — keeps middleware auth working)
// or reintroducing static export (would require dropping middleware-based
// route protection for this app specifically, relying on the client-side
// RequireRole guard alone). Don't treat webDir: "out" as correct until
// that decision is made.
const config: CapacitorConfig = {
  appId: "com.rideit.driver",
  appName: "Ride It Driver",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
