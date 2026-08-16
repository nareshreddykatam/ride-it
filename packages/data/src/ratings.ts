import type { SupabaseClient } from "@supabase/supabase-js";
import type { RatingRow } from "./types";

const RATING_COLUMNS = "id, ride_id, rated_by, rater_id, ratee_id, rating, comment, created_at";

/**
 * Submits a rating via submit_rating() — the sole path (Phase 15).
 * rated_by/ratee_id are derived server-side from the ride record, never
 * sent as parameters. Throws a real Postgres unique_violation if the
 * caller already rated this ride — callers should check
 * getOwnRatingForRide() first to avoid hitting this in normal use, but
 * the constraint remains the actual enforcement regardless.
 */
export async function submitRating(
  supabase: SupabaseClient,
  rideId: string,
  rating: number,
  comment?: string
): Promise<RatingRow> {
  const { data, error } = await supabase.rpc("submit_rating", {
    p_ride_id: rideId,
    p_rating: rating,
    p_comment: comment ?? null,
  });
  if (error) throw error;
  return data as unknown as RatingRow;
}

/**
 * Checks whether the current caller has already rated this ride, from
 * their own side — used to show "already rated" state instead of a
 * submit form. Scoped by ratings_select_participant RLS (rater or ratee
 * may read), further narrowed here to rows this caller authored.
 */
export async function getOwnRatingForRide(supabase: SupabaseClient, rideId: string, userId: string): Promise<RatingRow | null> {
  const { data, error } = await supabase
    .from("ratings")
    .select(RATING_COLUMNS)
    .eq("ride_id", rideId)
    .eq("rater_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as RatingRow | null) ?? null;
}

/**
 * The other ride participant's name only — via get_ride_participant_name()
 * (Phase 15), which deliberately stays available past ride completion
 * (unlike the broader drivers_select_active_ride_passenger/
 * passengers_select_active_ride_driver policies, which correctly stop
 * exposing the full profile once a ride ends). Built specifically so the
 * rating screens can show "Rate your trip with <name>" at exactly the
 * moment those broader policies no longer apply.
 */
export async function getRideParticipantName(supabase: SupabaseClient, rideId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_ride_participant_name", { p_ride_id: rideId });
  if (error) throw error;
  return (data as unknown as string | null) ?? null;
}

/**
 * Reviews received by a user — used for a ratee's own "feedback I've
 * received" view. Deliberately does not select rater_id for display
 * purposes at call sites (it exists in the row for RLS/audit reasons,
 * not meant to be surfaced prominently — see the Phase 15 review doc's
 * privacy section on why individual reviewer identity isn't emphasized
 * in a two-party direct-service context).
 */
export async function listReviewsReceived(supabase: SupabaseClient, userId: string, limit = 20): Promise<RatingRow[]> {
  const { data, error } = await supabase
    .from("ratings")
    .select(RATING_COLUMNS)
    .eq("ratee_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as RatingRow[];
}
