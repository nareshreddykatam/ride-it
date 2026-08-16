import type { SupabaseClient } from "@supabase/supabase-js";
import type { RideRow, RideStatusRow } from "./types";

/**
 * Admin-only query/mutation functions. Every write here relies on the
 * `*_all_admin` RLS policies already established in Phase 3
 * (`using (is_admin())`) — none of these functions grant themselves extra
 * privilege; they simply issue ordinary authenticated client calls that
 * only succeed because the calling session is a real admin. A driver or
 * passenger session calling the exact same code would get an RLS error,
 * not a successful write — the security boundary is the database, not
 * this file.
 *
 * No new SECURITY DEFINER functions were added for this module except
 * where explicitly noted — most admin actions here (approve a driver,
 * cancel a ride, edit a pricing rule) are plain table writes, because the
 * existing `_all_admin` policies already make them safe. Adding RPCs for
 * actions RLS already secures correctly would just be more surface area
 * to review for no security benefit.
 */

// ---------------------------------------------------------------------------
// Overview / Analytics
// ---------------------------------------------------------------------------

export interface AdminOverviewStats {
  driversOnline: number;
  ridesToday: number;
  activeSubscriptions: number;
  openSupportTickets: number;
  subscriptionRevenueThisMonth: number;
  rideFareVolumeThisMonth: number;
}

function startOfToday(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

function startOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

/**
 * All counts are real `count`-mode queries (`head: true` — no rows
 * transferred, Postgres returns just the count) against tables the admin
 * session already has full SELECT on. Revenue figures sum real
 * subscription_payments/rides rows for the current month — never a stored
 * or invented total.
 */
export async function getAdminOverviewStats(supabase: SupabaseClient): Promise<AdminOverviewStats> {
  const [driversOnline, ridesToday, activeSubscriptions, openTickets, payments, rides] = await Promise.all([
    supabase.from("drivers").select("id", { count: "exact", head: true }).eq("is_online", true),
    supabase.from("rides").select("id", { count: "exact", head: true }).gte("requested_at", startOfToday()),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
    supabase.from("subscription_payments").select("amount").eq("status", "paid").gte("paid_at", startOfMonth()),
    supabase
      .from("rides")
      .select("total_fare")
      .in("status", ["ride_completed", "rated"])
      .gte("requested_at", startOfMonth()),
  ]);

  if (driversOnline.error) throw driversOnline.error;
  if (ridesToday.error) throw ridesToday.error;
  if (activeSubscriptions.error) throw activeSubscriptions.error;
  if (openTickets.error) throw openTickets.error;
  if (payments.error) throw payments.error;
  if (rides.error) throw rides.error;

  const paymentRows = (payments.data ?? []) as unknown as Array<{ amount: number }>;
  const rideRows = (rides.data ?? []) as unknown as Array<{ total_fare: number }>;

  return {
    driversOnline: driversOnline.count ?? 0,
    ridesToday: ridesToday.count ?? 0,
    activeSubscriptions: activeSubscriptions.count ?? 0,
    openSupportTickets: openTickets.count ?? 0,
    subscriptionRevenueThisMonth: paymentRows.reduce((sum, p) => sum + p.amount, 0),
    rideFareVolumeThisMonth: rideRows.reduce((sum, r) => sum + r.total_fare, 0),
  };
}

export interface DayBucket {
  label: string;
  count: number;
}

/**
 * Buckets real ride requests by day, client-side, over the last N days.
 * No stored/derived aggregate table exists for this — for a fresh or
 * low-volume project this will correctly show near-zero counts, which is
 * the honest result, not a bug. There is no synthetic data anywhere in
 * this function.
 */
export async function getRideTrend(supabase: SupabaseClient, days = 7): Promise<DayBucket[]> {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase.from("rides").select("requested_at").gte("requested_at", since.toISOString());
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{ requested_at: string }>;

  const buckets: DayBucket[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(since);
    day.setDate(day.getDate() + i);
    const label = day.toLocaleDateString("en-IN", { weekday: "short" });
    const count = rows.filter((r) => {
      const d = new Date(r.requested_at);
      return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
    }).length;
    buckets.push({ label, count });
  }
  return buckets;
}

export interface MonthBucket {
  label: string;
  count: number;
}

/** Same honest-bucketing approach as getRideTrend, for subscriptions started per month. */
export async function getSubscriberGrowth(supabase: SupabaseClient, months = 5): Promise<MonthBucket[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1));
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase.from("subscriptions").select("starts_at").gte("starts_at", since.toISOString());
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{ starts_at: string }>;

  const buckets: MonthBucket[] = [];
  for (let i = 0; i < months; i++) {
    const month = new Date(since);
    month.setMonth(month.getMonth() + i);
    const label = month.toLocaleDateString("en-IN", { month: "short" });
    const count = rows.filter((r) => {
      const d = new Date(r.starts_at);
      return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
    }).length;
    buckets.push({ label, count });
  }
  return buckets;
}

export interface AdminRatingsSummary {
  driverAverage: number | null;
  passengerAverage: number | null;
}

/** Real averages from the ratings table — null (not 0, not invented) when there's no data yet. */
export async function getRatingsSummary(supabase: SupabaseClient): Promise<AdminRatingsSummary> {
  const { data, error } = await supabase.from("ratings").select("rated_by, rating");
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{ rated_by: "passenger" | "driver"; rating: number }>;

  const driverRatings = rows.filter((r) => r.rated_by === "passenger").map((r) => r.rating);
  const passengerRatings = rows.filter((r) => r.rated_by === "driver").map((r) => r.rating);

  const avg = (nums: number[]) => (nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null);

  return { driverAverage: avg(driverRatings), passengerAverage: avg(passengerRatings) };
}

export interface CancellationRateStats {
  requested: number;
  cancelled: number;
  ratePercent: number | null;
}

export async function getCancellationRate(supabase: SupabaseClient, days = 7): Promise<CancellationRateStats> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [total, cancelled] = await Promise.all([
    supabase.from("rides").select("id", { count: "exact", head: true }).gte("requested_at", since.toISOString()),
    supabase
      .from("rides")
      .select("id", { count: "exact", head: true })
      .eq("status", "cancelled")
      .gte("requested_at", since.toISOString()),
  ]);
  if (total.error) throw total.error;
  if (cancelled.error) throw cancelled.error;

  const requested = total.count ?? 0;
  const cancelledCount = cancelled.count ?? 0;
  return {
    requested,
    cancelled: cancelledCount,
    ratePercent: requested > 0 ? (cancelledCount / requested) * 100 : null,
  };
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

export interface AdminDriverListRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  vehicle_type: "bike" | "auto";
  verification_status: "pending" | "in_review" | "approved" | "rejected" | "suspended";
  rating: number;
  is_online: boolean;
}

const ADMIN_DRIVER_LIST_COLUMNS =
  "id, vehicle_type, verification_status, rating, is_online, users:id(full_name, phone)";

function normalizeUserJoin<T>(
  row: T & { users: { full_name: string | null; phone: string | null } | Array<{ full_name: string | null; phone: string | null }> }
) {
  const userRow = Array.isArray(row.users) ? row.users[0] : row.users;
  return { full_name: userRow?.full_name ?? null, phone: userRow?.phone ?? null };
}

export async function listDriversAdmin(
  supabase: SupabaseClient,
  filters: { search?: string; status?: AdminDriverListRow["verification_status"] } = {}
): Promise<AdminDriverListRow[]> {
  let query = supabase.from("drivers").select(ADMIN_DRIVER_LIST_COLUMNS).order("created_at", { ascending: false });
  if (filters.status) query = query.eq("verification_status", filters.status);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    vehicle_type: AdminDriverListRow["vehicle_type"];
    verification_status: AdminDriverListRow["verification_status"];
    rating: number;
    is_online: boolean;
    users: { full_name: string | null; phone: string | null } | Array<{ full_name: string | null; phone: string | null }>;
  }>;

  const mapped = rows.map((r) => ({ ...r, ...normalizeUserJoin(r) }));

  if (!filters.search) return mapped;
  const term = filters.search.trim().toLowerCase();
  return mapped.filter((r) => r.full_name?.toLowerCase().includes(term) || r.phone?.includes(term));
}

/**
 * Sets a driver's verification_status/verification_notes directly.
 *
 * SECURITY: this is a plain table UPDATE, not an RPC — deliberately. Two
 * independent layers already make a driver approving/rejecting themselves
 * impossible: (1) protect_driver_system_columns() (Phase 6.2, extended
 * Phase 7) rejects changes to verification_status/verification_notes from
 * any session that isn't is_admin() or an explicitly trusted write, and
 * (2) drivers_all_admin's RLS predicate itself requires is_admin() to
 * write to a drivers row at all outside drivers_update_own's narrower
 * self-scope. A non-admin calling this exact function against their own
 * driver row fails at the trigger; calling it via a different UPDATE path
 * fails the same way. Adding a SECURITY DEFINER RPC on top would not
 * close any gap that isn't already closed — it would only add an
 * unnecessary privileged function, which item 13 of this phase's brief
 * explicitly warns against ("do not create broad SECURITY DEFINER
 * functions").
 */
export async function setDriverVerificationStatus(
  supabase: SupabaseClient,
  driverId: string,
  status: AdminDriverListRow["verification_status"],
  notes?: string
): Promise<void> {
  const { error } = await supabase
    .from("drivers")
    .update({ verification_status: status, verification_notes: notes ?? null })
    .eq("id", driverId);
  if (error) throw error;
}

/**
 * Admin-only UPI verification — a plain table update, secured the same
 * way as setDriverVerificationStatus above: protect_driver_system_columns
 * (Phase 6.2/7/11) blocks any non-admin session from setting
 * upi_verified directly, so this succeeds only for a real admin session.
 * There is no client-facing way for a driver to self-verify.
 */
export async function setDriverUpiVerified(supabase: SupabaseClient, driverId: string, verified: boolean): Promise<void> {
  const { error } = await supabase
    .from("drivers")
    .update({ upi_verified: verified, upi_verified_at: verified ? new Date().toISOString() : null })
    .eq("id", driverId);
  if (error) throw error;
}

export interface AdminDriverSubscriptionSummary {
  plan: string;
  status: string;
  expires_at: string;
}

export async function getDriverActiveSubscriptionAdmin(
  supabase: SupabaseClient,
  driverId: string
): Promise<AdminDriverSubscriptionSummary | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, status, expires_at")
    .eq("driver_id", driverId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data as unknown as AdminDriverSubscriptionSummary | null;
}

export interface AdminDriverEarningsSummary {
  totalRides: number;
  totalEarnings: number;
}

export async function getDriverEarningsSummaryAdmin(
  supabase: SupabaseClient,
  driverId: string
): Promise<AdminDriverEarningsSummary> {
  const { data, error } = await supabase
    .from("rides")
    .select("total_fare")
    .eq("driver_id", driverId)
    .in("status", ["ride_completed", "rated"]);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{ total_fare: number }>;
  return { totalRides: rows.length, totalEarnings: rows.reduce((s, r) => s + r.total_fare, 0) };
}

// ---------------------------------------------------------------------------
// Passengers
// ---------------------------------------------------------------------------

export interface AdminPassengerListRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  rating: number;
  total_rides: number;
  is_active: boolean;
}

export async function listPassengersAdmin(
  supabase: SupabaseClient,
  filters: { search?: string } = {}
): Promise<AdminPassengerListRow[]> {
  const { data, error } = await supabase
    .from("passengers")
    .select("id, rating, total_rides, users:id(full_name, phone, is_active)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    rating: number;
    total_rides: number;
    users:
      | { full_name: string | null; phone: string | null; is_active: boolean }
      | Array<{ full_name: string | null; phone: string | null; is_active: boolean }>;
  }>;

  const mapped = rows.map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      id: r.id,
      rating: r.rating,
      total_rides: r.total_rides,
      full_name: u?.full_name ?? null,
      phone: u?.phone ?? null,
      is_active: u?.is_active ?? true,
    };
  });

  if (!filters.search) return mapped;
  const term = filters.search.trim().toLowerCase();
  return mapped.filter((r) => r.full_name?.toLowerCase().includes(term) || r.phone?.includes(term));
}

export async function getPassengerAdminDetail(supabase: SupabaseClient, passengerId: string) {
  const { data, error } = await supabase
    .from("passengers")
    .select("id, rating, total_rides, default_payment_method, users:id(full_name, phone, email, is_active)")
    .eq("id", passengerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    rating: number;
    total_rides: number;
    default_payment_method: string | null;
    users:
      | { full_name: string | null; phone: string | null; email: string | null; is_active: boolean }
      | Array<{ full_name: string | null; phone: string | null; email: string | null; is_active: boolean }>;
  };
  const u = Array.isArray(row.users) ? row.users[0] : row.users;

  return {
    id: row.id,
    rating: row.rating,
    total_rides: row.total_rides,
    default_payment_method: row.default_payment_method,
    full_name: u?.full_name ?? null,
    phone: u?.phone ?? null,
    email: u?.email ?? null,
    is_active: u?.is_active ?? true,
  };
}

/** Suspends/reactivates a passenger by toggling users.is_active — secured by users_all_admin RLS. */
export async function setPassengerActive(supabase: SupabaseClient, passengerId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from("users").update({ is_active: isActive }).eq("id", passengerId);
  if (error) throw error;
}

export interface SupportTicketRow {
  id: string;
  user_id: string | null;
  ride_id: string | null;
  category: string;
  severity: string;
  status: string;
  subject: string;
  description: string | null;
  reported_user_id: string | null;
  created_at: string;
}

const SUPPORT_TICKET_COLUMNS =
  "id, user_id, ride_id, category, severity, status, subject, description, reported_user_id, created_at";

export async function listSupportTicketsForUser(supabase: SupabaseClient, userId: string): Promise<SupportTicketRow[]> {
  const { data, error } = await supabase
    .from("support_tickets")
    .select(SUPPORT_TICKET_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SupportTicketRow[];
}

export async function listSupportTicketsForRide(supabase: SupabaseClient, rideId: string): Promise<SupportTicketRow[]> {
  const { data, error } = await supabase
    .from("support_tickets")
    .select(SUPPORT_TICKET_COLUMNS)
    .eq("ride_id", rideId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SupportTicketRow[];
}

/** Admin-wide listing for the Safety Dashboard — every open/in-progress ticket, optionally filtered to safety-relevant categories. */
export async function listSupportTicketsAdmin(
  supabase: SupabaseClient,
  filters: { category?: string; status?: string } = {}
): Promise<SupportTicketRow[]> {
  let query = supabase.from("support_tickets").select(SUPPORT_TICKET_COLUMNS).order("created_at", { ascending: false });
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as SupportTicketRow[];
}

export interface AdminSafetyEventRow {
  id: string;
  user_id: string;
  user_name: string | null;
  triggered_by_role: string;
  ride_id: string | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

/** Every safety_events row, for Admin's Safety Dashboard — secured by safety_events_all_admin RLS (Phase 13), same pattern as every other admin.ts query. */
export async function listSafetyEventsAdmin(
  supabase: SupabaseClient,
  filters: { status?: string } = {}
): Promise<AdminSafetyEventRow[]> {
  let query = supabase
    .from("safety_events")
    .select(
      "id, user_id, triggered_by_role, ride_id, status, latitude, longitude, note, created_at, acknowledged_at, resolved_at, users:user_id(full_name)"
    )
    .order("created_at", { ascending: false });
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<
    Omit<AdminSafetyEventRow, "user_name"> & {
      users: { full_name: string | null } | Array<{ full_name: string | null }>;
    }
  >;
  return rows.map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return { ...r, user_name: u?.full_name ?? null };
  });
}

/** Admin-only status transition — calls set_safety_event_status(), which independently re-checks is_admin() itself. */
export async function setSafetyEventStatusAdmin(
  supabase: SupabaseClient,
  eventId: string,
  status: "open" | "acknowledged" | "investigating" | "resolved" | "closed",
  note?: string
): Promise<void> {
  const { error } = await supabase.rpc("set_safety_event_status", {
    p_event_id: eventId,
    p_status: status,
    p_note: note ?? null,
  });
  if (error) throw error;
}

export async function updateSupportTicketStatus(
  supabase: SupabaseClient,
  ticketId: string,
  status: "open" | "in_progress" | "resolved" | "closed"
): Promise<void> {
  const { error } = await supabase
    .from("support_tickets")
    .update({ status, resolved_at: status === "resolved" || status === "closed" ? new Date().toISOString() : null })
    .eq("id", ticketId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Rides
// ---------------------------------------------------------------------------

const ADMIN_RIDE_COLUMNS =
  "id, passenger_id, driver_id, vehicle_type, status, pickup_address, drop_address, distance_km, base_fare, distance_fare, total_fare, currency, payment_method, payment_status, cancelled_by, cancellation_reason, requested_at, completed_at, cancelled_at, passenger:passenger_id(id, users:id(full_name)), driver:driver_id(id, users:id(full_name))";

export interface AdminRideListRow extends RideRow {
  passenger_name: string | null;
  driver_name: string | null;
}

function extractName(joined: unknown): string | null {
  if (!joined) return null;
  const row = (Array.isArray(joined) ? joined[0] : joined) as { users?: unknown } | undefined;
  const users = row?.users;
  const userRow = (Array.isArray(users) ? users[0] : users) as { full_name?: string | null } | undefined;
  return userRow?.full_name ?? null;
}

/** Live Rides — non-terminal statuses only, matching the rides_active_status_idx partial index built for exactly this query in Phase 3. */
export async function listLiveRidesAdmin(supabase: SupabaseClient): Promise<AdminRideListRow[]> {
  const { data, error } = await supabase
    .from("rides")
    .select(ADMIN_RIDE_COLUMNS)
    .not("status", "in", "(ride_completed,cancelled,rated)")
    .order("requested_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<RideRow & { passenger: unknown; driver: unknown }>;
  return rows.map((r) => ({ ...r, passenger_name: extractName(r.passenger), driver_name: extractName(r.driver) }));
}

export async function listRidesAdmin(
  supabase: SupabaseClient,
  filters: { status?: RideStatusRow; limit?: number } = {}
): Promise<AdminRideListRow[]> {
  let query = supabase.from("rides").select(ADMIN_RIDE_COLUMNS).order("requested_at", { ascending: false });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<RideRow & { passenger: unknown; driver: unknown }>;
  return rows.map((r) => ({ ...r, passenger_name: extractName(r.passenger), driver_name: extractName(r.driver) }));
}

export async function getRideAdminDetail(supabase: SupabaseClient, rideId: string): Promise<AdminRideListRow | null> {
  const { data, error } = await supabase.from("rides").select(ADMIN_RIDE_COLUMNS).eq("id", rideId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as RideRow & { passenger: unknown; driver: unknown };
  return { ...row, passenger_name: extractName(row.passenger), driver_name: extractName(row.driver) };
}

export interface RideEventRow {
  id: string;
  ride_id: string;
  event_type: string;
  actor_type: "passenger" | "driver" | "system" | "admin";
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export async function listRideEvents(supabase: SupabaseClient, rideId: string): Promise<RideEventRow[]> {
  const { data, error } = await supabase
    .from("ride_events")
    .select("id, ride_id, event_type, actor_type, actor_id, payload, created_at")
    .eq("ride_id", rideId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as RideEventRow[];
}

/**
 * Admin cancellation — a plain table UPDATE, secured by rides_all_admin
 * RLS (Phase 3). cancelled_by is set to 'system' (the enum has no 'admin'
 * value — passenger/driver/system — see cancelled_by_enum); the *actual*
 * admin actor is recorded precisely in the ride_events row below via
 * actor_type='admin', which is the column this schema actually designed
 * for attributing an action to a specific admin.
 */
export async function adminCancelRide(
  supabase: SupabaseClient,
  rideId: string,
  adminId: string,
  reason: string
): Promise<void> {
  const { error: rideError } = await supabase
    .from("rides")
    .update({ status: "cancelled", cancelled_by: "system", cancellation_reason: reason })
    .eq("id", rideId);
  if (rideError) throw rideError;

  const { error: eventError } = await supabase.from("ride_events").insert({
    ride_id: rideId,
    event_type: "admin_cancelled",
    actor_type: "admin",
    actor_id: adminId,
    payload: { reason },
  });
  if (eventError) throw eventError;
}

/** Reassigns an in-progress ride to a different driver. Secured by rides_all_admin RLS. */
export async function adminReassignRide(
  supabase: SupabaseClient,
  rideId: string,
  adminId: string,
  newDriverId: string
): Promise<void> {
  const { error: rideError } = await supabase.from("rides").update({ driver_id: newDriverId }).eq("id", rideId);
  if (rideError) throw rideError;

  const { error: eventError } = await supabase.from("ride_events").insert({
    ride_id: rideId,
    event_type: "admin_reassigned",
    actor_type: "admin",
    actor_id: adminId,
    payload: { new_driver_id: newDriverId },
  });
  if (eventError) throw eventError;
}

export async function addAdminRideNote(
  supabase: SupabaseClient,
  rideId: string,
  adminId: string,
  note: string
): Promise<void> {
  const { error } = await supabase.from("ride_events").insert({
    ride_id: rideId,
    event_type: "admin_note",
    actor_type: "admin",
    actor_id: adminId,
    payload: { note },
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export interface SubscriptionPlanRow {
  plan: "daily" | "weekly" | "monthly" | "yearly";
  amount: number;
  duration_days: number;
  is_active: boolean;
}

export async function listSubscriptionPlansAdmin(supabase: SupabaseClient): Promise<SubscriptionPlanRow[]> {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("plan, amount, duration_days, is_active")
    .order("duration_days", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as SubscriptionPlanRow[];
}

/** Secured by subscription_plans_all_admin RLS (Phase 6.1). */
export async function updateSubscriptionPlanAmount(
  supabase: SupabaseClient,
  plan: SubscriptionPlanRow["plan"],
  amount: number
): Promise<void> {
  const { error } = await supabase.from("subscription_plans").update({ amount }).eq("plan", plan);
  if (error) throw error;
}

export interface AdminSubscriptionPaymentRow {
  id: string;
  driver_id: string;
  driver_name: string | null;
  amount: number;
  status: "pending" | "paid" | "failed" | "refunded";
  payment_method: string | null;
  provider: string | null;
  paid_at: string | null;
  created_at: string;
}

export async function listSubscriptionPaymentsAdmin(supabase: SupabaseClient, limit = 50): Promise<AdminSubscriptionPaymentRow[]> {
  const { data, error } = await supabase
    .from("subscription_payments")
    .select(
      "id, driver_id, amount, status, payment_method, provider, paid_at, created_at, driver:driver_id(id, users:id(full_name))"
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<AdminSubscriptionPaymentRow & { driver: unknown }>;
  return rows.map((r) => ({ ...r, driver_name: extractName(r.driver) }));
}

export interface SubscriptionPlanCounts {
  plan: string;
  activeCount: number;
}

export async function getActiveSubscriptionCountsByPlan(supabase: SupabaseClient): Promise<SubscriptionPlanCounts[]> {
  const { data, error } = await supabase.from("subscriptions").select("plan").eq("status", "active");
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{ plan: string }>;
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.plan, (counts.get(r.plan) ?? 0) + 1);
  return Array.from(counts.entries()).map(([plan, activeCount]) => ({ plan, activeCount }));
}

// ---------------------------------------------------------------------------
// Cities
// ---------------------------------------------------------------------------

export interface CityRow {
  id: string;
  name: string;
  state: string | null;
  country: string;
  is_active: boolean;
  launched_at: string | null;
}

export async function listCitiesAdmin(supabase: SupabaseClient): Promise<CityRow[]> {
  const { data, error } = await supabase
    .from("cities")
    .select("id, name, state, country, is_active, launched_at")
    .order("launched_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as CityRow[];
}

/** Secured by cities_all_admin RLS (Phase 3). */
export async function setCityActive(supabase: SupabaseClient, cityId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from("cities").update({ is_active: isActive }).eq("id", cityId);
  if (error) throw error;
}

export async function createCity(
  supabase: SupabaseClient,
  input: { name: string; state?: string; country?: string }
): Promise<CityRow> {
  const { data, error } = await supabase
    .from("cities")
    .insert({ name: input.name, state: input.state ?? null, country: input.country ?? "India" })
    .select("id, name, state, country, is_active, launched_at")
    .single();
  if (error) throw error;
  return data as unknown as CityRow;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface AppSettingRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

export async function listAppSettingsAdmin(supabase: SupabaseClient): Promise<AppSettingRow[]> {
  const { data, error } = await supabase.from("app_settings").select("key, value, description, updated_at").order("key");
  if (error) throw error;
  return (data ?? []) as unknown as AppSettingRow[];
}

/** Secured by app_settings_all_admin RLS (Phase 3). */
export async function updateAppSetting(
  supabase: SupabaseClient,
  key: string,
  value: unknown,
  adminId: string
): Promise<void> {
  const { error } = await supabase.from("app_settings").update({ value, updated_by: adminId }).eq("key", key);
  if (error) throw error;
}

export interface PricingRuleRow {
  id: string;
  city_id: string | null;
  vehicle_type: "bike" | "auto";
  base_fare: number;
  per_km_rate: number;
  cancellation_fee: number;
  is_active: boolean;
}

export async function listPricingRulesAdmin(supabase: SupabaseClient): Promise<PricingRuleRow[]> {
  const { data, error } = await supabase
    .from("pricing_rules")
    .select("id, city_id, vehicle_type, base_fare, per_km_rate, cancellation_fee, is_active")
    .eq("is_active", true)
    .is("city_id", null)
    .order("vehicle_type");
  if (error) throw error;
  return (data ?? []) as unknown as PricingRuleRow[];
}

/** Secured by pricing_rules_all_admin RLS (Phase 3). */
export async function updatePricingRule(
  supabase: SupabaseClient,
  ruleId: string,
  patch: { baseFare?: number; perKmRate?: number }
): Promise<void> {
  const update: Record<string, number> = {};
  if (patch.baseFare !== undefined) update.base_fare = patch.baseFare;
  if (patch.perKmRate !== undefined) update.per_km_rate = patch.perKmRate;
  const { error } = await supabase.from("pricing_rules").update(update).eq("id", ruleId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// RBAC — Admin Users
// ---------------------------------------------------------------------------

export interface AdminRoleRow {
  id: string;
  name: string;
  description: string | null;
}

export async function listAdminRoles(supabase: SupabaseClient): Promise<AdminRoleRow[]> {
  const { data, error } = await supabase.from("admin_roles").select("id, name, description").order("name");
  if (error) throw error;
  return (data ?? []) as unknown as AdminRoleRow[];
}

export interface AdminPermissionRow {
  id: string;
  code: string;
  description: string | null;
}

export async function listAdminPermissions(supabase: SupabaseClient): Promise<AdminPermissionRow[]> {
  const { data, error } = await supabase.from("admin_permissions").select("id, code, description").order("code");
  if (error) throw error;
  return (data ?? []) as unknown as AdminPermissionRow[];
}

/** role_id -> permission codes, for rendering the "Can / Cannot" matrix from real data. */
export async function listRolePermissionMap(supabase: SupabaseClient): Promise<Record<string, string[]>> {
  const { data, error } = await supabase
    .from("admin_role_permissions")
    .select("admin_role_id, admin_permissions:admin_permission_id(code)");
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    admin_role_id: string;
    admin_permissions: { code: string } | Array<{ code: string }>;
  }>;

  const map: Record<string, string[]> = {};
  for (const r of rows) {
    const perm = Array.isArray(r.admin_permissions) ? r.admin_permissions[0] : r.admin_permissions;
    if (!perm) continue;
    const existing = map[r.admin_role_id] ?? [];
    existing.push(perm.code);
    map[r.admin_role_id] = existing;
  }
  return map;
}

export interface AdminUserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  admin_role_id: string;
  role_name: string | null;
  is_super_admin: boolean;
}

export async function listAdminUsers(supabase: SupabaseClient): Promise<AdminUserRow[]> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, admin_role_id, is_super_admin, users:id(full_name, email), admin_roles:admin_role_id(name)");
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    admin_role_id: string;
    is_super_admin: boolean;
    users: { full_name: string | null; email: string | null } | Array<{ full_name: string | null; email: string | null }>;
    admin_roles: { name: string } | Array<{ name: string }>;
  }>;

  return rows.map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    const role = Array.isArray(r.admin_roles) ? r.admin_roles[0] : r.admin_roles;
    return {
      id: r.id,
      admin_role_id: r.admin_role_id,
      is_super_admin: r.is_super_admin,
      full_name: u?.full_name ?? null,
      email: u?.email ?? null,
      role_name: role?.name ?? null,
    };
  });
}

/** Returns the current admin session's own role info — used to gate UI (not a security boundary; RLS is). */
export async function getCurrentAdminInfo(supabase: SupabaseClient, userId: string): Promise<AdminUserRow | null> {
  const all = await listAdminUsers(supabase);
  return all.find((a) => a.id === userId) ?? null;
}

/**
 * Reassigns an existing admin's role. Secured entirely by
 * admin_users_write_super_admin RLS (Phase 3: `using (is_super_admin())`)
 * — an ordinary (non-super) admin session's UPDATE simply matches zero
 * rows here; there is nothing else in this function that could let them
 * grant themselves anything. This function never touches is_super_admin
 * at all — that flag can only be set via provision_admin_user()
 * (service-role only, Phase 6.2), never from this app.
 */
export async function updateAdminUserRole(supabase: SupabaseClient, adminUserId: string, newRoleId: string): Promise<void> {
  const { error } = await supabase.from("admin_users").update({ admin_role_id: newRoleId }).eq("id", adminUserId);
  if (error) throw error;
}
