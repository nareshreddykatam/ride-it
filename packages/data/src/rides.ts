import type { SupabaseClient } from "@supabase/supabase-js";
import type { RideRow, VehicleTypeRow, PaymentMethodRow } from "./types";

const RIDE_COLUMNS =
  "id, passenger_id, driver_id, vehicle_id, city_id, vehicle_type, status, pickup_address, drop_address, distance_km, base_fare, distance_fare, discount_amount, total_fare, currency, payment_method, payment_status, passenger_rating, driver_rating, cancelled_by, cancellation_reason, requested_at, completed_at, cancelled_at, created_at";

export interface GeoPointInput {
  lat: number;
  lng: number;
}

/** PostGIS geography accepts WKT text directly on insert — "POINT(lon lat)", X before Y. */
function toWkt({ lat, lng }: GeoPointInput): string {
  return `POINT(${lng} ${lat})`;
}

export interface CreateRideInput {
  passengerId: string;
  vehicleType: VehicleTypeRow;
  pickup: GeoPointInput;
  pickupAddress: string;
  drop: GeoPointInput;
  dropAddress: string;
  distanceKm: number;
  baseFare: number;
  distanceFare: number;
  /**
   * Optional — no city-selection UI exists in the booking flow yet (out of
   * scope to add this phase, see Phase 8 review doc), so this is normally
   * omitted. When omitted, the matching engine (see
   * @ride-it/data/matching.ts) treats the ride as city-unscoped and
   * matches against any city's drivers — the architecture supports
   * multi-city (Vijayawada, Hyderabad, ...) the moment a caller starts
   * passing this.
   */
  cityId?: string;
}

/**
 * Creates a ride in status "requested". Matching itself (finding and
 * offering the ride to eligible drivers) is a separate step — see
 * @ride-it/data/matching.ts's startMatching(), called by the Passenger
 * app's booking-confirm flow immediately after this succeeds.
 */
export async function createRide(supabase: SupabaseClient, input: CreateRideInput): Promise<RideRow> {
  const totalFare = input.baseFare + input.distanceFare;

  const { data, error } = await supabase
    .from("rides")
    .insert({
      passenger_id: input.passengerId,
      vehicle_type: input.vehicleType,
      status: "requested",
      pickup_location: toWkt(input.pickup),
      pickup_address: input.pickupAddress,
      drop_location: toWkt(input.drop),
      drop_address: input.dropAddress,
      distance_km: input.distanceKm,
      base_fare: input.baseFare,
      distance_fare: input.distanceFare,
      total_fare: totalFare,
      city_id: input.cityId ?? null,
    })
    .select(RIDE_COLUMNS)
    .single();

  if (error) throw error;
  return data as unknown as RideRow;
}

export async function getRide(supabase: SupabaseClient, rideId: string): Promise<RideRow | null> {
  const { data, error } = await supabase
    .from("rides")
    .select(RIDE_COLUMNS)
    .eq("id", rideId)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as RideRow | null;
}

export async function listPassengerRides(
  supabase: SupabaseClient,
  passengerId: string,
  limit = 20
): Promise<RideRow[]> {
  const { data, error } = await supabase
    .from("rides")
    .select(RIDE_COLUMNS)
    .eq("passenger_id", passengerId)
    .order("requested_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as RideRow[];
}

/**
 * Passenger cancellation — only valid pre-arrival per the RLS policy on
 * `rides` (rides_update_passenger restricts this at the database level
 * too, not just here).
 */
// cancelRide() removed (Phase 10) — superseded by cancelActiveRide() above
// (post-acceptance) and matching.ts's cancelMatchingRide() (Phase 8,
// pre-acceptance). Two functions rather than one because the two states
// have genuinely different cleanup needs (superseding pending ride_offers
// only applies pre-acceptance) and different people to notify (no
// assigned driver exists yet pre-acceptance).

// ratePassengerRide() removed (Phase 15) — superseded by submitRating()
// in ratings.ts, which closes a real authorization gap this function's
// direct .insert() had: it never verified the ride was actually
// completed, and relied on the since-removed ratings_insert_participant
// RLS policy, which never checked that ratee_id/rated_by genuinely
// matched the caller's real role on the ride. See migration
// 20260819090100_submit_rating.sql for the full reasoning.

/**
 * Marks the driver as having arrived — now an RPC (mark_driver_arriving,
 * Phase 10), not a plain client update. Converted specifically so the
 * accompanying passenger notification can be created server-side,
 * trustworthy regardless of client behavior (see migration
 * 20260815090200's header for the full reasoning).
 */
export async function markDriverArriving(supabase: SupabaseClient, rideId: string): Promise<RideRow | null> {
  const { data, error } = await supabase.rpc("mark_driver_arriving", { p_ride_id: rideId });
  if (error) throw error;
  return data as unknown as RideRow | null;
}

/**
 * Verifies the driver-entered Ride PIN and, if correct, starts the ride —
 * a single atomic call to verify_ride_pin_and_start() (Phase 10),
 * superseding the old per-ride SMS-OTP verifyRideOtp()/startRide() pair.
 * Returns null (not an error) on an incorrect PIN — there is no
 * attempt-limit/lockout by explicit product decision; a wrong PIN simply
 * doesn't start the ride, and the driver can immediately try again.
 *
 * SECURITY: this RPC is now the ONLY way a ride can reach ride_started —
 * a new database trigger (protect_ride_start_transition, migration
 * 20260815090100) rejects any direct client attempt to set
 * status='ride_started', closing a real pre-existing gap where the
 * broad rides_update_driver RLS policy would otherwise have allowed a
 * driver to bypass verification entirely.
 */
export async function verifyRidePinAndStart(
  supabase: SupabaseClient,
  rideId: string,
  enteredPin: string
): Promise<RideRow | null> {
  const { data, error } = await supabase.rpc("verify_ride_pin_and_start", {
    p_ride_id: rideId,
    p_entered_pin: enteredPin,
  });
  if (error) throw error;
  return data as unknown as RideRow | null;
}

/** Now an RPC (complete_ride, Phase 10) — notifies both passenger and driver as part of the same atomic transition. */
export async function completeRide(supabase: SupabaseClient, rideId: string): Promise<RideRow> {
  const { data, error } = await supabase.rpc("complete_ride", { p_ride_id: rideId });
  if (error) throw error;
  return data as unknown as RideRow;
}

/**
 * Post-acceptance cancellation (accepted/driver_arriving) — calls
 * passenger_cancel_active_ride() (Phase 10), which also notifies the
 * assigned driver as part of the same atomic transition. For
 * cancellation during matching (before a driver is assigned), use
 * cancelMatchingRide() from matching.ts instead — that one supersedes
 * pending ride_offers, which don't exist once a driver is already
 * assigned. Supersedes the old plain-client-update cancelRide().
 */
export async function cancelActiveRide(supabase: SupabaseClient, rideId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("passenger_cancel_active_ride", { p_ride_id: rideId, p_reason: reason });
  if (error) throw error;
}

/**
 * Driver cancellation after acceptance — issues a strike per the confirmed
 * business rule (from the original product-architecture phase). The two
 * writes (ride status + driver strike count) are not atomic across tables
 * in this phase — a Postgres RPC function would be the correct fix if this
 * needs to be transactional, flagged as debt rather than built here, same
 * category as the wallet-transaction atomicity note from Phase 3.
 */
export async function cancelRideByDriver(
  supabase: SupabaseClient,
  rideId: string,
  driverId: string,
  reason: string
): Promise<void> {
  const { error: rideError } = await supabase
    .from("rides")
    .update({ status: "cancelled", cancelled_by: "driver", cancellation_reason: reason })
    .eq("id", rideId);
  if (rideError) throw rideError;

  // Phase 6.1: increment_driver_strike() no longer takes a driver_id
  // parameter — it always acts on auth.uid() only. driverId is still
  // accepted by this TS function for call-site source-compatibility (the
  // Driver app doesn't need to change) but is no longer forwarded.
  const { error: strikeError } = await supabase.rpc("increment_driver_strike");
  if (strikeError) throw strikeError;
}

/**
 * Marks the ride's chosen payment method. Deliberately does NOT process an
 * actual payment or change payment_status beyond what the DB default
 * already is — real payment processing is out of scope for this phase (see
 * Phase 5 review doc).
 */
export interface UpdateRidePaymentInput {
  paymentMethod: PaymentMethodRow;
}

export async function setRidePaymentMethod(
  supabase: SupabaseClient,
  rideId: string,
  input: UpdateRidePaymentInput
): Promise<RideRow> {
  const { data, error } = await supabase
    .from("rides")
    .update({ payment_method: input.paymentMethod })
    .eq("id", rideId)
    .select(RIDE_COLUMNS)
    .single();

  if (error) throw error;
  return data as unknown as RideRow;
}
