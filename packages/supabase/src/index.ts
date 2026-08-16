/**
 * Root barrel export. Deliberately does NOT re-export `client.ts` or
 * `server.ts` here — those must be imported from their own subpaths:
 *
 *   import { getSupabaseBrowserClient } from "@ride-it/supabase/client";  // Client Components only
 *   import { getSupabaseServerClient } from "@ride-it/supabase/server";  // Server Components / Route Handlers / Server Actions only
 *
 * Keeping them separate means a Client Component can never accidentally
 * pull in `next/headers` (server-only) through a barrel import, and a
 * server file never accidentally pulls in the browser client singleton.
 *
 * Everything below is safe in either context — these are plain functions
 * that take a SupabaseClient as a parameter rather than constructing one.
 */
export * from "./types";
export * from "./auth";
export * from "./db";
export * from "./storage";
