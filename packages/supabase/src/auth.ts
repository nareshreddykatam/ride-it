import type { SupabaseClient, Session, User } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Auth helpers — deliberately read-only/utility for now. Ridora's actual
 * sign-in flow (mobile OTP) is not wired to Supabase yet; these functions
 * just give the rest of the codebase a single, typed place to ask "who's
 * signed in?" once that wiring happens, instead of every screen calling
 * `supabase.auth.*` directly.
 *
 * Pass in a client from either @ride-it/supabase/client (browser) or
 * @ride-it/supabase/server (server) — these helpers work with either.
 */

export async function getSession(
  supabase: SupabaseClient<Database>
): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser(
  supabase: SupabaseClient<Database>
): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function signOut(supabase: SupabaseClient<Database>): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Subscribes to auth state changes (sign-in, sign-out, token refresh).
 * Intended for Client Components once real auth is wired up — returns the
 * unsubscribe function, matching the underlying Supabase subscription API.
 */
export function onAuthStateChange(
  supabase: SupabaseClient<Database>,
  callback: (session: Session | null) => void
): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => subscription.unsubscribe();
}
