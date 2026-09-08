import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * A plain, session-less anon client for genuinely public/unauthenticated
 * contexts (e.g. the Marketing app's homepage) — unlike client.ts/server.ts
 * this never touches cookies or `next/headers`, so it works from any Server
 * Component or Route Handler without opting the route out of static
 * rendering just to read a cookie jar there is no session in anyway.
 *
 * Only ever reaches data that is actually anon-grantable (RLS still applies
 * in full) — this is not a privilege escalation, just a client with no
 * session-management overhead for callers that will never have one.
 *
 * Usage (Server Component / Route Handler, no "use client"):
 *   import { getSupabasePublicClient } from "@ride-it/supabase/public";
 *   const supabase = getSupabasePublicClient();
 */
export function getSupabasePublicClient(): SupabaseClient<Database> {
  return createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
