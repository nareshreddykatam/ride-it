import type { SupabaseClient } from "@supabase/supabase-js";

export interface RidePinStatus {
  hasPin: boolean;
  updatedAt: string | null;
}

/**
 * Sets or changes the passenger's Ride PIN via set_ride_pin() (Phase 10).
 * Returns the plaintext PIN exactly once — this is the only moment the
 * plaintext exists outside the RPC's own transient local variable; it is
 * never stored anywhere and this function never persists it either
 * (callers hold it only in transient React state to display it, per the
 * Phase 10 review doc's explanation of why a permanent PIN can't be
 * "redisplayed" after being hashed).
 *
 * Pass no argument to auto-generate a new random PIN (server-side,
 * cryptographically random) rather than letting the passenger pick their
 * own digits — used for the "Change PIN" flow's default behavior.
 */
export async function setRidePin(supabase: SupabaseClient, newPin?: string): Promise<string> {
  const { data, error } = await supabase.rpc("set_ride_pin", newPin ? { p_new_pin: newPin } : {});
  if (error) throw error;
  return data as unknown as string;
}

/** Whether a Ride PIN is configured and when it was last changed — never returns the PIN or its hash. */
export async function getRidePinStatus(supabase: SupabaseClient): Promise<RidePinStatus> {
  const { data, error } = await supabase.rpc("get_ride_pin_status");
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { has_pin: boolean; updated_at: string | null } | undefined;
  return { hasPin: row?.has_pin ?? false, updatedAt: row?.updated_at ?? null };
}
