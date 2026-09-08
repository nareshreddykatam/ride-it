import type { SupabaseClient } from "@supabase/supabase-js";
import type { RideRow, RideOfferRow } from "./types";

const OFFER_COLUMNS =
  "id, ride_id, driver_id, status, batch_number, vehicle_type, pickup_address, drop_address, distance_km, base_fare, distance_fare, total_fare, currency, distance_to_pickup_meters, offered_at, expires_at, responded_at, created_at";

/**
 * Phase 8 replaces the old polling model (getNextAvailableRideRequest,
 * which queried `rides` directly for unassigned rows) with real-time
 * per-driver offers. That old approach was actually broken against a real
 * database from the moment it was written — rides_select_driver (Phase 3)
 * only ever permitted a driver to SELECT rides already assigned to them,
 * never unassigned ones, so it would have silently returned nothing. See
 * migration 20260813090000_ride_offers.sql for the full explanation.
 *
 * The Driver Dashboard now subscribes to new offers via
 * subscribeToDriverOffers() (matching.ts) instead of polling this module.
 */

const OFFERS_PAGE_SIZE = 25;

export interface DriverOffersPage {
  offers: RideOfferRow[];
  /** True if there may be more pending offers beyond this page — fetch the next page (passing `nextCursor` as `opts.after`) only if this is true; most drivers will have far fewer than one page's worth. */
  hasMore: boolean;
  /** Cursor for the next page (the last row's offered_at), or null if this page was empty. Pass as `opts.after` — NOT a numeric offset, deliberately: an offset would silently skip or repeat rows as offers ahead of it leave `pending` (accepted/rejected/expired) between page fetches, since that shifts what "row N" even means. A cursor keyed on offered_at is immune to that. */
  nextCursor: string | null;
}

/**
 * Every one of the driver's current live (pending, unexpired) offers —
 * used on mount/reconnect to reconcile state rather than relying solely on
 * the realtime stream. Ridora's matching model deliberately lets a driver
 * hold several simultaneous offers across different rides (see
 * 20260908070000_matching_allow_concurrent_offers_per_driver.sql), so this
 * returns a page of rows, not a single one — no arbitrary cap on how many
 * a driver may have; callers fetch another page (via `opts.after`) only if
 * genuinely needed for UI performance (each ride's own batch is already
 * small, so in practice a driver rarely approaches a full page).
 */
export async function getActiveOffersForDriver(
  supabase: SupabaseClient,
  driverId: string,
  opts?: { after?: string; pageSize?: number }
): Promise<DriverOffersPage> {
  const pageSize = opts?.pageSize ?? OFFERS_PAGE_SIZE;
  let query = supabase
    .from("ride_offers")
    .select(OFFER_COLUMNS)
    .eq("driver_id", driverId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("offered_at", { ascending: true })
    .limit(pageSize);
  if (opts?.after) {
    query = query.gt("offered_at", opts.after);
  }
  const { data, error } = await query;
  if (error) throw error;
  const offers = (data ?? []) as unknown as RideOfferRow[];
  const lastOffer = offers[offers.length - 1];
  return {
    offers,
    hasMore: offers.length === pageSize,
    nextCursor: lastOffer ? lastOffer.offered_at : (opts?.after ?? null),
  };
}

/**
 * Accepts the driver's current offer via the accept_ride_offer() RPC
 * (migration 20260813090300) — a single atomic conditional UPDATE on
 * `rides` that also validates the caller has a live pending offer, all in
 * one WHERE clause. Returns null (not an error) if the race was lost or
 * the offer expired.
 *
 * Same fix as verifyRidePinAndStart() in rides.ts, and for the identical
 * reason: the RPC's SQL `return null;` on a lost race serializes over
 * PostgREST as a JSON object with every field null (Postgres's
 * composite-NULL JSON representation), not the bare `null` literal —
 * truthy in JS, so a caller checking `if (accepted)` would otherwise be
 * told they won a race they actually lost.
 */
export async function acceptRideRequest(supabase: SupabaseClient, rideId: string): Promise<RideRow | null> {
  const { data, error } = await supabase.rpc("accept_ride_offer", { p_ride_id: rideId });
  if (error) throw error;
  const ride = data as unknown as RideRow | null;
  return ride?.id ? ride : null;
}

/** Explicit decline — marks the driver's own offer rejected via reject_ride_offer(). */
export async function rejectRideRequest(supabase: SupabaseClient, rideId: string): Promise<void> {
  const { error } = await supabase.rpc("reject_ride_offer", { p_ride_id: rideId });
  if (error) throw error;
}

/** @deprecated kept as a no-op alias for any lingering call sites during the Phase 8 transition — prefer rejectRideRequest(). */
export function dismissRideRequest(): void {
  // Intentionally a no-op — see rejectRideRequest() for the real path.
}
