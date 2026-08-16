import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "./types";

// See client.ts for why this is ReturnType<> rather than a re-stated
// SupabaseClient<Database> annotation.
type SupabaseMiddlewareClient = ReturnType<typeof createServerClient<Database>>;

/**
 * The generic, app-agnostic half of Next.js middleware auth handling:
 * refreshes the Supabase session cookies on every request (required — the
 * browser client's auto-refresh only runs while a tab is open; middleware
 * is what keeps a session alive across server-rendered navigations) and
 * returns the current user plus a request-scoped client so callers can run
 * one more query (e.g. role lookup) without constructing another client.
 *
 * App-specific behavior (redirect targets, required role) intentionally
 * does NOT live here — see @ride-it/auth/middleware's createAuthMiddleware,
 * which wraps this.
 */
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  supabase: SupabaseMiddlewareClient;
  user: User | null;
}> {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: "", ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  // IMPORTANT: getUser() (not getSession()) — it revalidates the token
  // against Supabase Auth server-side rather than trusting a possibly
  // stale cookie, which matters specifically in middleware.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, supabase, user };
}
