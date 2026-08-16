import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "./env";
import type { Database } from "./types";

// See client.ts for why this is ReturnType<> rather than a re-stated
// SupabaseClient<Database> annotation.
type SupabaseServerClient = ReturnType<typeof createServerClient<Database>>;

/**
 * Creates a request-scoped Supabase client for use on the server — Server
 * Components, Route Handlers, and Server Actions. Unlike the browser client
 * this is NOT a singleton: Next.js requires a fresh client per request so
 * it can read/write the current request's cookies correctly.
 *
 * Usage (Server Component / Route Handler / Server Action, no "use client"):
 *   import { getSupabaseServerClient } from "@ride-it/supabase/server";
 *   const supabase = getSupabaseServerClient();
 *
 * Note: `cookies().set()` throws when called from a Server Component render
 * (Next.js only allows mutating cookies from a Route Handler or Server
 * Action) — the try/catch below is the documented Supabase SSR pattern for
 * safely ignoring that specific case, not a general error swallow.
 */
export function getSupabaseServerClient(): SupabaseServerClient {
  const cookieStore = cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Called from a Server Component render — session refresh will
          // still happen via middleware once that's added later.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // See note above.
        }
      },
    },
  });
}

/**
 * Privileged client using the service-role key — bypasses Row Level
 * Security entirely. Server-only by construction (getSupabaseServiceRoleKey
 * throws if called from a browser bundle).
 *
 * Reserve this for trusted server-side operations only (e.g. an Admin app
 * Route Handler approving a driver's documents) — never expose it to a
 * Client Component, and never use it as a default in place of the
 * request-scoped `getSupabaseServerClient()` above.
 *
 * Usage (server-only):
 *   import { getSupabaseAdminClient } from "@ride-it/supabase/server";
 *   const supabaseAdmin = getSupabaseAdminClient();
 */
export function getSupabaseAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
