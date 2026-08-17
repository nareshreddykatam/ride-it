import type { SupabaseClient } from "@supabase/supabase-js";

export interface RidePinStatus {
  hasPin: boolean;
  updatedAt: string | null;
}

/**
 * Sets or changes the passenger's Ride PIN via set_ride_pin() (Phase 10;
 * revised in migration 20260821090100 to also store an encrypted copy for
 * display purposes — see getMyRidePin() below). Deliberately returns
 * nothing — the RPC itself no longer returns the plaintext at all.
 * Callers that need to show the passenger their new PIN must call
 * getMyRidePin() immediately afterward, the same single retrieval path
 * used everywhere a PIN is ever displayed (Profile's reveal-after-change,
 * and the active-ride screen). This function never sees, holds, or logs
 * the plaintext at any point — it exists only transiently inside the
 * RPC's own server-side execution.
 *
 * Pass no argument to auto-generate a new random PIN (server-side,
 * cryptographically random) rather than letting the passenger pick their
 * own digits — used for the "Change PIN" flow's default behavior.
 */
export async function setRidePin(supabase: SupabaseClient, newPin?: string): Promise<void> {
  const { error } = await supabase.rpc("set_ride_pin", newPin ? { p_new_pin: newPin } : {});
  if (error) throw error;
}

/** Whether a Ride PIN is configured and when it was last changed — never returns the PIN or its hash. */
export async function getRidePinStatus(supabase: SupabaseClient): Promise<RidePinStatus> {
  const { data, error } = await supabase.rpc("get_ride_pin_status");
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { has_pin: boolean; updated_at: string | null } | undefined;
  return { hasPin: row?.has_pin ?? false, updatedAt: row?.updated_at ?? null };
}

/**
 * Returns the CALLING passenger's own current permanent Ride PIN, or null
 * if none is set. Backed by get_my_ride_pin() (migration
 * 20260821090100_ride_pin_passenger_visibility) — the sole read path for
 * the plaintext mirror added specifically so the active-ride screen can
 * display "Your Ride PIN" once a driver has accepted, without changing
 * how the PIN is generated, hashed, or verified. The RPC takes no
 * target-id parameter, so this can never return another passenger's PIN.
 */
export async function getMyRidePin(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_my_ride_pin");
  if (error) throw error;
  return (data as unknown as string | null) ?? null;
}
