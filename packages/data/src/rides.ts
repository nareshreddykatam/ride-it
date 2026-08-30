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
 * Driver's own ride history — mirrors listPassengerRides() exactly (flat
 * RIDE_COLUMNS, no PostgREST embed, same default limit/ordering), scoped
 * to driver_id instead of passenger_id. Secured by the existing
 * rides_select_driver RLS policy (Phase 3) — a driver can only ever see
 * rides already assigned to them, never another driver's.
 */
export async function listDriverRides(
  supabase: SupabaseClient,
  driverId: string,
  limit = 20
): Promise<RideRow[]> {
  const { data, error } = await supabase
    .from("rides")
    .select(RIDE_COLUMNS)
    .eq("driver_id", driverId)
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

export interface CancellationReasonOption {
  value: string;
  label: string;
}

// Non-empty tuple, not plain CancellationReasonOption[] — same reasoning
// as ReportReasonList in safety.ts: PASSENGER_CANCELLATION_REASONS[0] is
// used as a form's default selection and must resolve to
// CancellationReasonOption, not `CancellationReasonOption | undefined`,
// under this project's noUncheckedIndexedAccess.
type CancellationReasonList = readonly [CancellationReasonOption, ...CancellationReasonOption[]];

/** Passenger-facing cancellation reasons — rides.cancellation_reason is a single free-text column, so a picked reason (plus an optional note) is composed into one string client-side rather than needing a schema change. */
export const PASSENGER_CANCELLATION_REASONS: CancellationReasonList = [
  { value: "driver_too_long", label: "Driver is taking too long" },
  { value: "wrong_pickup", label: "Wrong pickup location" },
  { value: "changed_mind", label: "Changed my mind" },
  { value: "booked_by_mistake", label: "Booked by mistake" },
  { value: "found_another_ride", label: "Found another ride" },
  { value: "other", label: "Other" },
];

/** Driver-facing cancellation reasons — same composition approach as PASSENGER_CANCELLATION_REASONS. */
export const DRIVER_CANCELLATION_REASONS: CancellationReasonList = [
  { value: "vehicle_issue", label: "Vehicle issue" },
  { value: "passenger_unreachable", label: "Passenger not reachable" },
  { value: "passenger_not_at_pickup", label: "Passenger not at pickup" },
  { value: "wrong_pickup", label: "Wrong pickup location" },
  { value: "personal_emergency", label: "Personal emergency" },
  { value: "other", label: "Other" },
];

/** Composes a picked reason label + optional free-text note into the single string rides.cancellation_reason stores. */
export function formatCancellationReason(reasons: readonly CancellationReasonOption[], value: string, note?: string): string {
  const label = reasons.find((r) => r.value === value)?.label ?? "Other";
  const trimmedNote = note?.trim();
  return trimmedNote ? `${label}: ${trimmedNote}` : label;
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
    .update({ status: "cancelled", cancelled_by: "driver", cancellation_reason: reason, cancelled_at: new Date().toISOString() })
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

/**
 * Passenger chooses a payment method for an ACTIVE ride (accepted /
 * driver_arriving / ride_started), validated server-side against the
 * assigned driver's actual accepted methods via
 * select_ride_payment_method() (migration
 * 20260821090300_ride_payment_method_selection) — the RPC throws if the
 * driver hasn't opted into the requested method, so a passenger can never
 * select something unavailable regardless of what the client believes.
 * Supersedes setRidePaymentMethod() above for the new post-acceptance
 * flow; that function is kept for the existing post-completion path,
 * unchanged.
 */
export async function selectRidePaymentMethod(
  supabase: SupabaseClient,
  rideId: string,
  method: PaymentMethodRow
): Promise<RideRow> {
  const { data, error } = await supabase.rpc("select_ride_payment_method", { p_ride_id: rideId, p_method: method });
  if (error) throw error;
  return data as unknown as RideRow;
}

export interface MatchedDriverContact {
  fullName: string | null;
  phone: string | null;
  plateNumber: string | null;
}

/**
 * Calls get_matched_driver_contact() (migrations
 * 20260827090000/20260827090100) — the sole path for a passenger to read
 * their matched driver's name/phone/active-vehicle-plate. There is
 * deliberately no general passenger-readable RLS policy on public.users or
 * public.vehicles for another user's row; getDriverProfile()'s embed and a
 * direct vehicles select both come back null/empty for a passenger caller
 * for exactly that reason. Returns null fields (not an error) if the ride
 * isn't the caller's own active ride — same "quiet null, not a thrown
 * error" shape as getRideTracking().
 */
export async function getMatchedDriverContact(supabase: SupabaseClient, rideId: string): Promise<MatchedDriverContact> {
  const { data, error } = await supabase.rpc("get_matched_driver_contact", { p_ride_id: rideId });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as
    | { full_name: string | null; phone: string | null; plate_number: string | null }
    | undefined;
  return { fullName: row?.full_name ?? null, phone: row?.phone ?? null, plateNumber: row?.plate_number ?? null };
}

/**
 * Calls get_matched_driver_selfie_path() (migration
 * 20260827090000_matched_driver_contact_access) — returns a Storage
 * *path*, never a URL. The caller (a Route Handler; see
 * apps/passenger/app/api/rides/[id]/driver-selfie/route.ts) is
 * responsible for minting a short-lived signed URL server-side from this
 * path. Never expose the raw path itself to a browser.
 */
export async function getMatchedDriverSelfiePath(supabase: SupabaseClient, rideId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_matched_driver_selfie_path", { p_ride_id: rideId });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export interface MatchedPassengerContact {
  fullName: string | null;
  phone: string | null;
}

/**
 * Calls get_matched_passenger_contact() (migration
 * 20260829090100) — the driver-side mirror of getMatchedDriverContact().
 * There is deliberately no general driver-readable RLS policy on
 * public.users for another user's row; this narrow SECURITY DEFINER
 * function is the sole path, scoped to the caller's own currently-assigned,
 * non-terminal ride. Returns null fields (not an error) otherwise.
 */
export async function getMatchedPassengerContact(supabase: SupabaseClient, rideId: string): Promise<MatchedPassengerContact> {
  const { data, error } = await supabase.rpc("get_matched_passenger_contact", { p_ride_id: rideId });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as { full_name: string | null; phone: string | null } | undefined;
  return { fullName: row?.full_name ?? null, phone: row?.phone ?? null };
}
