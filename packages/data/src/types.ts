/**
 * These mirror the actual Postgres schema (snake_case, as migrated) —
 * deliberately separate from packages/types' camelCase UI-facing types
 * (Ride, VehicleType, etc.), which describe what screens render, not what
 * the database stores. Query functions in this package return these; each
 * screen maps what it needs into its existing UI shape at the call site,
 * so no existing component's prop types had to change.
 *
 * Written by hand rather than generated, because packages/supabase/src/types.ts
 * is still the Phase 3 placeholder — see that file's comment and the Phase
 * 4.5 validation report's "remaining technical debt" section. Once
 * `supabase gen types typescript` is run for real, these can be replaced
 * with generated equivalents; the function signatures below shouldn't need
 * to change.
 */

export type RideStatusRow =
  | "requested"
  | "matched"
  | "accepted"
  | "driver_arriving"
  | "ride_started"
  | "ride_completed"
  | "payment"
  | "rated"
  | "cancelled";
// Note: the underlying DB enum (ride_status_enum) still technically
// contains 'otp_verified' as a legacy value — dropping an enum value is a
// more invasive operation than this phase's scope warrants (see Phase 10
// review doc). Nothing in the app transitions a ride through it anymore;
// verify_ride_pin_and_start() goes directly from driver_arriving to
// ride_started.

export type VehicleTypeRow = "bike" | "scooty" | "auto" | "car";
export type PaymentMethodRow = "cash" | "driver_upi" | "online";
export type PaymentStatusRow = "pending" | "paid" | "failed" | "refunded";
export type CancelledByRow = "passenger" | "driver" | "system";

export interface RideRow {
  id: string;
  passenger_id: string;
  driver_id: string | null;
  vehicle_id: string | null;
  city_id: string | null;
  vehicle_type: VehicleTypeRow;
  status: RideStatusRow;
  pickup_address: string | null;
  drop_address: string | null;
  distance_km: number | null;
  base_fare: number;
  distance_fare: number;
  discount_amount: number;
  total_fare: number;
  surge_multiplier: number;
  currency: string;
  payment_method: PaymentMethodRow | null;
  payment_status: PaymentStatusRow;
  passenger_rating: number | null;
  driver_rating: number | null;
  cancelled_by: CancelledByRow | null;
  cancellation_reason: string | null;
  requested_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export type RideOfferStatusRow = "pending" | "accepted" | "rejected" | "expired" | "superseded";

export interface RideOfferRow {
  id: string;
  ride_id: string;
  driver_id: string;
  status: RideOfferStatusRow;
  batch_number: number;
  vehicle_type: VehicleTypeRow;
  pickup_address: string | null;
  drop_address: string | null;
  distance_km: number | null;
  base_fare: number;
  distance_fare: number;
  total_fare: number;
  currency: string;
  distance_to_pickup_meters: number | null;
  offered_at: string;
  expires_at: string;
  responded_at: string | null;
  created_at: string;
}

export type PaymentGatewayStatusRow =
  | "created"
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "cancelled"
  | "refunded"
  | "partially_refunded";

export interface PaymentRow {
  id: string;
  ride_id: string;
  passenger_id: string;
  amount: number;
  currency: string;
  status: PaymentGatewayStatusRow;
  provider: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  failure_reason: string | null;
  refund_id: string | null;
  refunded_amount: number | null;
  created_at: string;
  authorized_at: string | null;
  captured_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
}

export type RatedByRow = "passenger" | "driver";

export interface RatingRow {
  id: string;
  ride_id: string;
  rated_by: RatedByRow;
  rater_id: string;
  ratee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export type GenderRow = "male" | "female" | "other" | "prefer_not_to_say";

export interface PassengerProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: GenderRow | null;
  rating: number;
  total_rides: number;
  default_payment_method: PaymentMethodRow | null;
}

export interface SavedPlaceRow {
  id: string;
  passenger_id: string;
  label: string;
  address: string;
  icon: string | null;
  is_default: boolean;
  created_at: string;
  /** Via the saved_places_lat/lng PostgREST computed columns (20260824090000) — the real stored coordinates, not derivable from address text alone. */
  lat: number;
  lng: number;
}

export type NotificationTypeRow =
  | "ride_status"
  | "offer"
  | "driver_arrival"
  | "payment_confirmation"
  | "subscription"
  | "system";

export interface TrustedContactRow {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  relationship_label: string | null;
  is_active: boolean;
  created_at: string;
}

export type SafetyEventStatusRow = "open" | "acknowledged" | "investigating" | "escalated" | "resolved" | "closed";
export type SafetyEventSeverityRow = "low" | "medium" | "high" | "critical";

export interface SafetyEventRow {
  id: string;
  user_id: string;
  triggered_by_role: "passenger" | "driver" | "admin";
  ride_id: string | null;
  status: SafetyEventStatusRow;
  severity: SafetyEventSeverityRow;
  event_type: string;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface SafetyEventNoteRow {
  id: string;
  safety_event_id: string;
  admin_id: string | null;
  admin_name: string | null;
  note: string | null;
  status_transition_to: SafetyEventStatusRow | null;
  created_at: string;
}

export interface RideShareRow {
  id: string;
  ride_id: string;
  passenger_id: string;
  trusted_contact_id: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface SharedRideInfo {
  rideStatus: RideStatusRow;
  driverName: string | null;
  vehicleType: VehicleTypeRow;
  pickupAddress: string | null;
  dropAddress: string | null;
  driverLocation: { lat: number; lng: number } | null;
  driverLocationUpdatedAt: string | null;
  sharedAt: string;
}

export type SupportTicketSeverityRow = "low" | "medium" | "high" | "critical";

export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationTypeRow;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}
