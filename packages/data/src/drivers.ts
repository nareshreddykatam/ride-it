import type { SupabaseClient } from "@supabase/supabase-js";

export interface DriverProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  vehicle_type: "bike" | "auto";
  verification_status: "pending" | "in_review" | "approved" | "rejected" | "suspended";
  verification_notes: string | null;
  rating: number;
  total_rides: number;
  strike_count: number;
  is_online: boolean;
  upi_id: string | null;
  upi_verified: boolean;
}

const DRIVER_PROFILE_COLUMNS =
  "id, vehicle_type, verification_status, verification_notes, rating, total_rides, strike_count, is_online, upi_id, upi_verified, created_at, users:id(full_name, phone)";

export async function getDriverProfile(supabase: SupabaseClient, driverId: string): Promise<DriverProfileRow | null> {
  const { data, error } = await supabase
    .from("drivers")
    .select(DRIVER_PROFILE_COLUMNS)
    .eq("id", driverId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const joined = data as unknown as {
    id: string;
    vehicle_type: DriverProfileRow["vehicle_type"];
    verification_status: DriverProfileRow["verification_status"];
    verification_notes: string | null;
    rating: number;
    total_rides: number;
    strike_count: number;
    is_online: boolean;
    upi_id: string | null;
    upi_verified: boolean;
    users: { full_name: string | null; phone: string | null } | Array<{ full_name: string | null; phone: string | null }>;
  };
  const userRow = Array.isArray(joined.users) ? joined.users[0] : joined.users;

  return {
    id: joined.id,
    vehicle_type: joined.vehicle_type,
    verification_status: joined.verification_status,
    verification_notes: joined.verification_notes,
    rating: joined.rating,
    total_rides: joined.total_rides,
    strike_count: joined.strike_count,
    is_online: joined.is_online,
    upi_id: joined.upi_id,
    upi_verified: joined.upi_verified,
    full_name: userRow?.full_name ?? null,
    phone: userRow?.phone ?? null,
  };
}

/**
 * Sets the driver's own UPI identity — a plain client update, already
 * secured by the existing drivers_update_own RLS policy (self-only).
 * upi_verified is NOT settable here (protected by
 * protect_driver_system_columns, Phase 6.2/7/11) — a database trigger
 * separately resets upi_verified to false whenever upi_id changes
 * (migration 20260816090000), so a driver can never keep a stale
 * "verified" badge after switching to a different UPI ID.
 */
export async function setDriverUpiId(supabase: SupabaseClient, driverId: string, upiId: string): Promise<void> {
  const { error } = await supabase.from("drivers").update({ upi_id: upiId }).eq("id", driverId);
  if (error) throw error;
}

/**
 * Toggles online status. Does NOT check subscription validity itself —
 * callers (the Dashboard screen) check getActiveSubscription() first and
 * keep the toggle disabled if there's no active subscription, matching the
 * "no active subscription = can't go online" rule from the original PRD.
 * Enforcing that at the database level too (a check constraint or trigger)
 * is a reasonable hardening step, flagged as debt rather than added here to
 * keep this migration set focused on what Phase 6 actually needs.
 */
export async function setDriverOnlineStatus(supabase: SupabaseClient, driverId: string, isOnline: boolean): Promise<void> {
  const { error } = await supabase.from("drivers").update({ is_online: isOnline }).eq("id", driverId);
  if (error) throw error;
}

/**
 * Reports the driver's current position — a plain client UPDATE, already
 * secured by the existing drivers_update_own RLS policy (self-only, same
 * as is_online). Only current_location is sent; location_updated_at is set
 * server-side by a trigger (migration 20260813090500) whenever
 * current_location actually changes — a driver cannot claim freshness by
 * sending an arbitrary timestamp, since none is accepted from the client
 * at all. The matching engine's freshness check
 * (driver_location_freshness_seconds) is only meaningful if this
 * timestamp is genuinely trustworthy.
 */
export async function updateDriverLocation(
  supabase: SupabaseClient,
  driverId: string,
  location: { lat: number; lng: number }
): Promise<void> {
  const { error } = await supabase
    .from("drivers")
    .update({ current_location: `POINT(${location.lng} ${location.lat})` })
    .eq("id", driverId);
  if (error) throw error;
}

export interface SubscriptionRow {
  id: string;
  driver_id: string;
  plan: "daily" | "weekly" | "monthly" | "yearly";
  status: "active" | "grace_period" | "expired" | "cancelled";
  amount: number;
  starts_at: string;
  expires_at: string;

}

const SUBSCRIPTION_COLUMNS = "id, driver_id, plan, status, amount, starts_at, expires_at";

export async function getActiveSubscription(supabase: SupabaseClient, driverId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("driver_id", driverId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  return data as unknown as SubscriptionRow | null;
}

export interface PendingSubscriptionPayment {
  id: string;
  subscription_id: string;
  driver_id: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "refunded";
  payment_method: string | null;
  provider: string | null;
  provider_order_id: string | null;
  provider_payment_id: string | null;
}

/**
 * Step 1 of a real subscription purchase (Phase 11) — supersedes the
 * dropped purchase_subscription_simulated(). amount/duration are read
 * from subscription_plans server-side, never a parameter. The returned
 * row's subscription is NOT active yet — only mark_subscription_payment_captured
 * (called from the payment verify/webhook Route Handler after real
 * gateway confirmation) activates it.
 */
export async function createPendingSubscriptionPayment(
  supabase: SupabaseClient,
  plan: SubscriptionRow["plan"]
): Promise<PendingSubscriptionPayment> {
  const { data, error } = await supabase.rpc("create_pending_subscription_payment", { p_plan: plan });
  if (error) throw error;
  return data as unknown as PendingSubscriptionPayment;
}

export async function attachSubscriptionPaymentOrder(
  supabase: SupabaseClient,
  paymentId: string,
  providerOrderId: string
): Promise<PendingSubscriptionPayment> {
  const { data, error } = await supabase.rpc("attach_subscription_payment_order", {
    p_payment_id: paymentId,
    p_provider_order_id: providerOrderId,
  });
  if (error) throw error;
  return data as unknown as PendingSubscriptionPayment;
}

/** Called from the subscription verify Route Handler only, after server-side signature verification — the only path that actually activates a subscription. */
export async function markSubscriptionPaymentCaptured(
  supabase: SupabaseClient,
  paymentId: string,
  providerPaymentId: string
): Promise<PendingSubscriptionPayment> {
  const { data, error } = await supabase.rpc("mark_subscription_payment_captured", {
    p_payment_id: paymentId,
    p_provider_payment_id: providerPaymentId,
  });
  if (error) throw error;
  return data as unknown as PendingSubscriptionPayment;
}
