import type { SupabaseClient } from "@supabase/supabase-js";
import type { RideRow, RideOfferRow, RideStatusRow } from "./types";

/**
 * Kicks off matching for a freshly-created ride — calls dispatch_next_batch()
 * once immediately (rather than waiting for the first heartbeat interval to
 * elapse) so the Matching screen doesn't sit idle for a full tick before
 * anything happens. Safe to call even if a batch already exists (the RPC is
 * idempotent — it only proceeds if the ride is still requested/matched).
 */
export async function startMatching(supabase: SupabaseClient, rideId: string): Promise<void> {
  const { error } = await supabase.rpc("dispatch_next_batch", { p_ride_id: rideId });
  if (error) throw error;
}

/**
 * The matching heartbeat — expires stale offers and dispatches the next
 * batch if none is currently live. Returns the ride's current status so
 * the caller can decide whether to keep polling (still 'requested'/
 * 'matched'), stop and navigate (any other status), etc.
 *
 * This is a pull-based design, not a push from a background scheduler —
 * see the migration comment in 20260813090300_matching_engine.sql for why
 * (no cron/Edge Function scheduling available to configure without a live
 * Supabase project). The Passenger app's Matching screen calls this on a
 * short interval while searching.
 */
export async function advanceMatching(supabase: SupabaseClient, rideId: string): Promise<RideStatusRow> {
  const { data, error } = await supabase.rpc("advance_ride_matching", { p_ride_id: rideId });
  if (error) throw error;
  return data as unknown as RideStatusRow;
}

/**
 * Cancellation during the matching phase (requested/matched) — also
 * supersedes any pending offers atomically, so driver UIs stop showing a
 * request for a ride that no longer exists. For cancellation after
 * acceptance, use cancelActiveRide() from rides.ts instead (Phase 10) —
 * there are no offers to clean up at that point, but the assigned driver
 * needs a cancellation notification instead.
 */
export async function cancelMatchingRide(supabase: SupabaseClient, rideId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("passenger_cancel_matching_ride", {
    p_ride_id: rideId,
    p_reason: reason ?? "Passenger cancelled",
  });
  if (error) throw error;
}

export interface RideTrackingInfo {
  rideId: string;
  status: RideStatusRow;
  pickup: { lat: number; lng: number };
  drop: { lat: number; lng: number };
  driverLocation: { lat: number; lng: number } | null;
  driverLocationUpdatedAt: string | null;
  distanceToPickupMeters: number | null;
  distanceToDropMeters: number | null;
}

/**
 * Calls get_ride_tracking() (migration 20260814090000) — the only
 * sanctioned way to read decoded pickup/drop/driver coordinates for a
 * ride. No client ever selects pickup_location/drop_location/
 * current_location directly (PostgREST would return undecoded WKB hex for
 * those anyway). The RPC enforces authorization explicitly (ride's
 * passenger, assigned driver, or admin) — this wrapper adds nothing on
 * top, it's a thin typed pass-through.
 */
export async function getRideTracking(supabase: SupabaseClient, rideId: string): Promise<RideTrackingInfo | null> {
  const { data, error } = await supabase.rpc("get_ride_tracking", { p_ride_id: rideId });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        ride_id: string;
        status: RideStatusRow;
        pickup_lat: number;
        pickup_lng: number;
        drop_lat: number;
        drop_lng: number;
        driver_lat: number | null;
        driver_lng: number | null;
        driver_location_updated_at: string | null;
        distance_to_pickup_meters: number | null;
        distance_to_drop_meters: number | null;
      }
    | undefined;

  if (!row) return null;

  return {
    rideId: row.ride_id,
    status: row.status,
    pickup: { lat: row.pickup_lat, lng: row.pickup_lng },
    drop: { lat: row.drop_lat, lng: row.drop_lng },
    driverLocation: row.driver_lat !== null && row.driver_lng !== null ? { lat: row.driver_lat, lng: row.driver_lng } : null,
    driverLocationUpdatedAt: row.driver_location_updated_at,
    distanceToPickupMeters: row.distance_to_pickup_meters,
    distanceToDropMeters: row.distance_to_drop_meters,
  };
}

/**
 * Subscribes to changes on the assigned driver's row as a refetch signal
 * only — the raw postgres_changes payload for a geography column is still
 * undecoded WKB, not usable lat/lng (see get_ride_tracking's migration
 * comment). Callers should re-call getRideTracking() when this fires, not
 * read coordinates out of the callback's payload.
 */
export function subscribeToDriverLocationChanges(supabase: SupabaseClient, driverId: string, onChange: () => void) {
  const channel = supabase
    .channel(`driver-location:${driverId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "drivers", filter: `id=eq.${driverId}` },
      () => onChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribes to realtime changes on a single ride row — used by the
 * Passenger Matching/Ride-status screens and Admin's Ride Detail. Filtered
 * to one row's id, not a broadcast-all subscription. RLS still applies:
 * Supabase Realtime evaluates the subscriber's SELECT policy per change
 * event, so a passenger only ever receives events for rides they can
 * already read (rides_select_passenger), same for drivers/admins.
 */
export function subscribeToRide(
  supabase: SupabaseClient,
  rideId: string,
  onChange: (ride: RideRow) => void
) {
  const channel = supabase
    .channel(`ride:${rideId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${rideId}` },
      (payload) => onChange(payload.new as unknown as RideRow)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribes to new ride offers made to the calling driver. Filtered to
 * `driver_id=eq.<driverId>` — a driver's subscription only ever receives
 * rows RLS already lets them see (ride_offers_select_own_driver), so this
 * is not a separate trust boundary, just a targeted filter for efficiency
 * ("do not subscribe every client to every ride").
 */
export function subscribeToDriverOffers(
  supabase: SupabaseClient,
  driverId: string,
  onOffer: (offer: RideOfferRow) => void
) {
  const channel = supabase
    .channel(`driver-offers:${driverId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "ride_offers", filter: `driver_id=eq.${driverId}` },
      (payload) => onOffer(payload.new as unknown as RideOfferRow)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribes to updates on a specific offer (e.g. superseded by another
 * driver winning, or expired) so the Driver app can dismiss the sheet
 * immediately instead of waiting for its local countdown to reach zero.
 */
export function subscribeToOfferUpdates(
  supabase: SupabaseClient,
  offerId: string,
  onUpdate: (offer: RideOfferRow) => void
) {
  const channel = supabase
    .channel(`offer:${offerId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "ride_offers", filter: `id=eq.${offerId}` },
      (payload) => onUpdate(payload.new as unknown as RideOfferRow)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Broad (unfiltered) subscription to ride status changes, for Admin's Live
 * Rides screen only — admin's RLS (rides_all_admin) already grants full
 * visibility, so this mirrors that at the realtime layer rather than
 * granting anything new. Not used by Passenger/Driver, which always
 * subscribe with a specific row/driver filter.
 */
export function subscribeToAllRideChanges(supabase: SupabaseClient, onChange: () => void) {
  const channel = supabase
    .channel("admin-rides")
    .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, () => onChange())
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
