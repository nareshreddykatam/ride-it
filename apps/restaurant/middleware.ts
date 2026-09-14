import { createAuthMiddleware } from "@ride-it/auth/middleware";

// Same row-existence capability pattern as the Passenger/Driver apps
// (packages/auth/src/middleware.ts's capabilityTable option) — NOT a
// users.role='restaurant_owner' match, since handle_new_auth_user() never
// assigns that role value today (see ensure_restaurant_owner_profile()'s
// migration comment). A signed-in user without a restaurant_owners row yet
// is routed to /onboarding, which creates it, exactly like a first-time
// passenger/driver.
export const middleware = createAuthMiddleware({
  requiredRole: "restaurant_owner",
  publicPaths: ["/", "/login", "/verify"],
  loginPath: "/login",
  authenticatedHomePath: "/dashboard",
  capabilityTable: "restaurant_owners",
  onboardingPath: "/onboarding",
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
