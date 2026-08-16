import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@ride-it/supabase/middleware";
import type { AppRole } from "./types";

export interface AuthMiddlewareOptions {
  requiredRole: AppRole;
  /** Exact-match or prefix-match paths that don't require auth (e.g. login/verify screens). */
  publicPaths: string[];
  loginPath: string;
  /** Where an already-authenticated, correctly-roled user is sent if they land on a public path (e.g. Login). */
  authenticatedHomePath: string;
}

function matchesPath(pathname: string, patterns: string[]): boolean {
  return patterns.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Builds the Next.js middleware function for one app. Each app (passenger/
 * driver/admin) has its own thin middleware.ts at its project root (a Next.js
 * requirement — the file itself can't live in a shared package) that just
 * calls this with its own role/paths. The actual logic lives here, once.
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  return async function authMiddleware(request: NextRequest): Promise<NextResponse> {
    const { response, supabase, user } = await updateSession(request);
    const pathname = request.nextUrl.pathname;
    const isPublicPath = matchesPath(pathname, options.publicPaths);

    if (!user) {
      if (isPublicPath) return response;
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = options.loginPath;
      return NextResponse.redirect(redirectUrl);
    }

    // Authenticated — confirm the role matches this app. A passenger
    // session hitting the Driver app (or vice versa) is signed out rather
    // than silently allowed through with the wrong permissions.
    const { data } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
    // Cast rather than rely on inference — packages/supabase/src/types.ts
    // is still the Phase 3 placeholder Database type (Tables: Record<string,
    // never>), so PostgREST's return type here is `never` until real types
    // are generated. See that file's comment and the Phase 4.5/6.1 debt notes.
    const profile = data as unknown as { role: AppRole } | null;

    if (!profile || profile.role !== options.requiredRole) {
      await supabase.auth.signOut();
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = options.loginPath;
      redirectUrl.searchParams.set("error", "wrong_app");
      return NextResponse.redirect(redirectUrl);
    }

    if (isPublicPath) {
      // Correctly-authenticated user landing on any public path (including
      // "/" — the Splash screen, which has no reason to run for someone
      // already signed in) — send them straight to their home path instead
      // of showing an auth/splash screen they'd just bounce off of.
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = options.authenticatedHomePath;
      return NextResponse.redirect(redirectUrl);
    }

    return response;
  };
}
