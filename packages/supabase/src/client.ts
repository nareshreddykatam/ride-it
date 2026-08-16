"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "./types";

// ReturnType<> rather than a manually re-stated SupabaseClient<Database>
// annotation — @supabase/ssr's generic shape can drift from
// @supabase/supabase-js's own SupabaseClient type across versions (found
// during Phase 6.2's real tsc run), and this stays correct regardless.
type SupabaseBrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let browserClient: SupabaseBrowserClient | undefined;

/**
 * Returns a singleton Supabase client for use in Client Components.
 * Safe to call repeatedly — the underlying client is created once per
 * browser session and reused.
 *
 * Usage (inside a "use client" component):
 *   import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
 *   const supabase = getSupabaseBrowserClient();
 */
export function getSupabaseBrowserClient(): SupabaseBrowserClient {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey());
  }
  return browserClient;
}
