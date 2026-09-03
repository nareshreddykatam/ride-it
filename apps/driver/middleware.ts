import { createAuthMiddleware } from "@ride-it/auth/middleware";

export const middleware = createAuthMiddleware({
  requiredRole: "driver",
  publicPaths: ["/", "/login", "/verify", "/api/e2e/login"],
  loginPath: "/login",
  authenticatedHomePath: "/dashboard",
  // Capability, not a strict role match — see createAuthMiddleware's own
  // comment. Lets a passenger-only Auth identity reach /onboarding here to
  // pick up driver capability too, instead of being signed out.
  capabilityTable: "drivers",
  onboardingPath: "/onboarding",
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|firebase-messaging-sw.js).*)"],
};
