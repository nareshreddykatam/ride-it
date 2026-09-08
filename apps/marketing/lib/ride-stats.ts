import { getSupabasePublicClient } from "@ride-it/supabase/public";

export interface PublicRideStats {
  successfulRides: number;
}

/**
 * Backs the homepage's "successful rides" counter. Calls
 * get_public_ride_stats() (supabase/migrations/20260908090000_public_ride_stats.sql)
 * — a SECURITY DEFINER function granted to `anon` that returns ONLY this one
 * aggregate integer; RLS still blocks any direct read of `rides` itself.
 *
 * Returns null on any failure (missing env config, network error, RPC
 * error) so the caller can hide the stat rather than ever render a
 * fabricated or stale-looking number.
 */
export async function getPublicRideStats(): Promise<PublicRideStats | null> {
  try {
    const supabase = getSupabasePublicClient();
    const { data, error } = await supabase.rpc("get_public_ride_stats");
    if (error) throw error;
    const row = (data as unknown as { successful_rides: number }[] | null)?.[0];
    if (!row || typeof row.successful_rides !== "number") return null;
    return { successfulRides: row.successful_rides };
  } catch {
    return null;
  }
}
