import { createAuthMiddleware } from "@ride-it/auth/middleware";

export const middleware = createAuthMiddleware({
  requiredRole: "driver",
  publicPaths: ["/", "/login", "/verify", "/api/e2e/login"],
  loginPath: "/login",
  authenticatedHomePath: "/dashboard",
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
