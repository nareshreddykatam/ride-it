import { createAuthMiddleware } from "@ride-it/auth/middleware";

export const middleware = createAuthMiddleware({
  requiredRole: "passenger",
  // /shared is the trusted-contact ride-sharing recipient view (Phase 13)
  // — deliberately public. A trusted contact is, by definition, not a
  // Ride It account holder; authorization there comes entirely from
  // possessing the share token (see get_shared_ride_info()'s migration
  // comment), not from a session.
  publicPaths: ["/", "/login", "/verify", "/shared", "/api/e2e/login"],
  loginPath: "/login",
  authenticatedHomePath: "/home",
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json).*)"],
};
