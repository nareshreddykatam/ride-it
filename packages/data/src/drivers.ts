import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadFile, createSignedUrl } from "@ride-it/supabase/storage";
import type { GenderRow } from "./types";

export type DriverQrStatus = "pending" | "in_review" | "approved" | "rejected" | "suspended";

export interface DriverProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: GenderRow | null;
  vehicle_type: "bike" | "scooty" | "auto" | "car";
  verification_status: "pending" | "in_review" | "approved" | "rejected" | "suspended";
  verification_notes: string | null;
  rating: number;
  total_rides: number;
  strike_count: number;
  is_online: boolean;
  upi_id: string | null;
  upi_verified: boolean;
  accepts_cash: boolean;
  accepts_driver_upi: boolean;
  accepts_online: boolean;
  upi_qr_path: string | null;
  upi_qr_status: DriverQrStatus;
  upi_qr_uploaded_at: string | null;
  upi_qr_rejection_reason: string | null;
}

const DRIVER_PROFILE_COLUMNS =
  "id, vehicle_type, verification_status, verification_notes, rating, total_rides, strike_count, is_online, upi_id, upi_verified, accepts_cash, accepts_driver_upi, accepts_online, upi_qr_path, upi_qr_status, upi_qr_uploaded_at, upi_qr_rejection_reason, created_at, users!drivers_id_fkey(full_name, phone, email, date_of_birth, gender)";

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
    accepts_cash: boolean;
    accepts_driver_upi: boolean;
    accepts_online: boolean;
    upi_qr_path: string | null;
    upi_qr_status: DriverQrStatus;
    upi_qr_uploaded_at: string | null;
    upi_qr_rejection_reason: string | null;
    users:
      | { full_name: string | null; phone: string | null; email: string | null; date_of_birth: string | null; gender: GenderRow | null }
      | Array<{ full_name: string | null; phone: string | null; email: string | null; date_of_birth: string | null; gender: GenderRow | null }>;
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
    accepts_cash: joined.accepts_cash,
    accepts_driver_upi: joined.accepts_driver_upi,
    accepts_online: joined.accepts_online,
    upi_qr_path: joined.upi_qr_path,
    upi_qr_status: joined.upi_qr_status,
    upi_qr_uploaded_at: joined.upi_qr_uploaded_at,
    upi_qr_rejection_reason: joined.upi_qr_rejection_reason,
    full_name: userRow?.full_name ?? null,
    phone: userRow?.phone ?? null,
    email: userRow?.email ?? null,
    date_of_birth: userRow?.date_of_birth ?? null,
    gender: userRow?.gender ?? null,
  };
}

/** Part 3: passenger/driver both need onboarding completion, including vehicle info (checked separately via getActiveVehicle). */
export function isDriverPersonalInfoComplete(
  profile: Pick<DriverProfileRow, "full_name" | "phone" | "email" | "date_of_birth" | "gender">
): boolean {
  return Boolean(
    profile.full_name?.trim() && profile.phone?.trim() && profile.email?.trim() && profile.date_of_birth && profile.gender
  );
}

export interface UpdateDriverPersonalInfoInput {
  fullName?: string;
  email?: string;
  dateOfBirth?: string;
  gender?: GenderRow;
}

/**
 * Creates this identity's public.drivers (+ wallets) row if it doesn't
 * already exist — the missing piece for a same-email cross-role user (an
 * existing passenger who is now becoming a driver too): handle_new_auth_user()
 * only ever runs once, at original signup, and never re-fires for a
 * returning Auth identity. Safe/idempotent to call every time driver
 * onboarding starts (ensure_driver_profile() no-ops via ON CONFLICT for a
 * direct driver signup, whose row already exists from that trigger).
 * Never touches verification_status — authentication is not approval.
 */
export async function ensureDriverProfile(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("ensure_driver_profile");
  if (error) throw error;
}

export async function updateDriverPersonalInfo(
  supabase: SupabaseClient,
  driverId: string,
  input: UpdateDriverPersonalInfoInput
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (input.fullName !== undefined) updates.full_name = input.fullName;
  if (input.email !== undefined) updates.email = input.email;
  if (input.dateOfBirth !== undefined) updates.date_of_birth = input.dateOfBirth;
  if (input.gender !== undefined) updates.gender = input.gender;
  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase.from("users").update(updates).eq("id", driverId);
  if (error) throw error;
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

export interface DriverPaymentMethodPrefs {
  acceptsCash: boolean;
  acceptsDriverUpi: boolean;
  acceptsOnline: boolean;
}

/**
 * Sets which payment methods the driver is willing to accept — a plain
 * client update, secured by the existing drivers_update_own RLS policy
 * (self-only). Deliberately NOT protected by protect_driver_system_columns
 * — choosing your own accepted methods is a legitimate driver preference,
 * not a self-approval of a verification outcome (unlike upi_qr_status).
 * Whether driver_upi/online are actually OFFERABLE to a passenger still
 * depends server-side on upi_verified / upi_qr_status at selection time
 * (Phase E) — this function only records the driver's stated preference.
 */
export async function setDriverPaymentMethods(
  supabase: SupabaseClient,
  driverId: string,
  prefs: DriverPaymentMethodPrefs
): Promise<void> {
  const { error } = await supabase
    .from("drivers")
    .update({
      accepts_cash: prefs.acceptsCash,
      accepts_driver_upi: prefs.acceptsDriverUpi,
      accepts_online: prefs.acceptsOnline,
    })
    .eq("id", driverId);
  if (error) throw error;
}

const DRIVER_QR_BUCKET = "driver-payment-qr";
const DRIVER_QR_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const DRIVER_QR_ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"];

/**
 * Uploads/replaces the driver's UPI QR image. Validates MIME type and
 * file size client-side (the real, unbypassable enforcement is server-
 * side: storage RLS scopes the upload to the caller's own folder, and
 * reset_upi_qr_status_on_change() forces upi_qr_status back to 'pending'
 * the moment upi_qr_path changes — a client cannot upload a new image and
 * keep a stale 'approved' status by any path). Path convention mirrors
 * driver-documents exactly: `<driverId>/qr-<timestamp>.<ext>`.
 */
export async function uploadDriverQr(supabase: SupabaseClient, driverId: string, file: File): Promise<void> {
  if (!DRIVER_QR_ALLOWED_MIME.includes(file.type)) {
    throw new Error("QR image must be a PNG, JPEG, or WEBP file.");
  }
  if (file.size > DRIVER_QR_MAX_BYTES) {
    throw new Error("QR image must be smaller than 5MB.");
  }

  const ext = file.name.split(".").pop() || "png";
  const path = `${driverId}/qr-${Date.now()}.${ext}`;

  const { path: uploadedPath } = await uploadFile(supabase, DRIVER_QR_BUCKET, path, file, { contentType: file.type });

  const { error } = await supabase
    .from("drivers")
    .update({ upi_qr_path: uploadedPath, upi_qr_uploaded_at: new Date().toISOString() })
    .eq("id", driverId);
  if (error) throw error;
}

/** Short-lived signed URL for viewing a driver's uploaded QR — never a public path, mirrors getDriverDocumentSignedUrl exactly. */
export async function getDriverQrSignedUrl(supabase: SupabaseClient, filePath: string, expiresInSeconds = 300): Promise<string> {
  return createSignedUrl(supabase, DRIVER_QR_BUCKET, filePath, expiresInSeconds);
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
  created_at: string;
}

const SUBSCRIPTION_COLUMNS = "id, driver_id, plan, status, amount, starts_at, expires_at, created_at";

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

/**
 * The driver's full subscription history, newest first. No new table or
 * archival mechanism needed — every purchase already creates a NEW
 * subscriptions row (mark_subscription_payment_captured expires the prior
 * active row rather than overwriting it, 20260816090300), so this is
 * simply the existing ledger, unfiltered by status. Secured by the
 * existing subscriptions_select_own RLS policy (driver_id = auth.uid()).
 */
export async function listDriverSubscriptions(supabase: SupabaseClient, driverId: string, limit = 20): Promise<SubscriptionRow[]> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as SubscriptionRow[];
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

/**
 * Called from the subscription verify Route Handler only, after
 * server-side signature verification — the only path that actually
 * activates a subscription. providerOrderId is required
 * (20260825090000) — same cross-order/payment confusion fix as
 * markRidePaymentCaptured.
 */
export async function markSubscriptionPaymentCaptured(
  supabase: SupabaseClient,
  paymentId: string,
  providerPaymentId: string,
  providerOrderId: string
): Promise<PendingSubscriptionPayment> {
  const { data, error } = await supabase.rpc("mark_subscription_payment_captured", {
    p_payment_id: paymentId,
    p_provider_payment_id: providerPaymentId,
    p_provider_order_id: providerOrderId,
  });
  if (error) throw error;
  return data as unknown as PendingSubscriptionPayment;
}
