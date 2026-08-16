import { createAuthMiddleware } from "@ride-it/auth/middleware";

export const middleware = createAuthMiddleware({
  requiredRole: "admin",
  publicPaths: ["/login"],
  loginPath: "/login",
  authenticatedHomePath: "/overview",
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
