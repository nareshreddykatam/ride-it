import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin Command Center + KLU Pilot analytics. Every function here calls a
 * SECURITY DEFINER SQL/plpgsql RPC (migration 20260830090000) that does its
 * own `is_admin()` check and its own aggregation — nothing here fetches raw
 * rows and computes in JS. A non-admin session gets a real 42501 rejection
 * from the RPC itself, not merely a client-side gate.
 *
 * Every rate field is `number | null` — null means "no denominator", never
 * a fabricated 0%. Render null as "—", not "0%".
 */

async function callRpc<T>(supabase: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

async function callRpcSingleRow<T>(supabase: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const rows = await callRpc<T[]>(supabase, fn, args);
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new Error(`${fn} returned no row`);
  return row as T;
}

export interface LiveOpsSnapshot {
  active_rides: number;
  drivers_online: number;
  passengers_riding: number;
  open_ride_requests: number;
  drivers_available: number;
  active_safety_events: number;
  matching_success_rate_24h: number | null;
  avg_wait_seconds_24h: number | null;
  snapshot_at: string;
}

/** Phase 2 — the Command Center's top strip. */
export async function getLiveOpsSnapshot(supabase: SupabaseClient): Promise<LiveOpsSnapshot> {
  return callRpcSingleRow<LiveOpsSnapshot>(supabase, "admin_live_ops_snapshot");
}

export interface RideFunnel {
  requested_count: number;
  matched_count: number;
  accepted_count: number;
  driver_arriving_count: number;
  ride_started_count: number;
  completed_count: number;
  cancelled_user_count: number;
  cancelled_no_drivers_count: number;
  acceptance_rate: number | null;
  completion_rate: number | null;
  cancellation_rate: number | null;
  matching_timeout_rate: number | null;
}

/** Phase 3 — ride lifecycle funnel for [start, end], by rides.requested_at. */
export async function getRideFunnel(supabase: SupabaseClient, start: Date, end: Date): Promise<RideFunnel> {
  return callRpcSingleRow<RideFunnel>(supabase, "admin_ride_funnel", { p_start: start.toISOString(), p_end: end.toISOString() });
}

export interface PassengerMetrics {
  registered_count: number;
  active_count: number;
  new_count: number;
  returning_count: number;
  avg_rides_per_active: number | null;
  avg_spend: number | null;
  cancellation_rate: number | null;
  repeat_usage_rate: number | null;
}

/** Phase 4. */
export async function getPassengerMetrics(supabase: SupabaseClient, start: Date, end: Date): Promise<PassengerMetrics> {
  return callRpcSingleRow<PassengerMetrics>(supabase, "admin_passenger_metrics", {
    p_start: start.toISOString(),
    p_end: end.toISOString(),
  });
}

export interface DriverMetrics {
  registered_count: number;
  verified_count: number;
  active_count: number;
  online_count: number;
  subscribed_count: number;
  completing_rides_count: number;
  avg_rides_per_active: number | null;
  acceptance_rate: number | null;
  cancellation_rate: number | null;
  rides_per_driver_day: number | null;
  avg_earnings: number | null;
}

/** Phase 5. rides_per_driver_day is a PROXY for utilization — no online-session history exists to compute true busy-time fraction. Always label it as a proxy, never as "utilization %". */
export async function getDriverMetrics(supabase: SupabaseClient, start: Date, end: Date): Promise<DriverMetrics> {
  return callRpcSingleRow<DriverMetrics>(supabase, "admin_driver_metrics", { p_start: start.toISOString(), p_end: end.toISOString() });
}

export interface VehicleAnalyticsRow {
  vehicle_type: "auto" | "bike" | "scooty" | "car";
  requests: number;
  completed: number;
  cancelled: number;
  avg_fare: number | null;
  avg_distance_km: number | null;
  avg_duration_seconds: number | null;
  avg_wait_seconds: number | null;
  acceptance_rate: number | null;
  completion_rate: number | null;
}

/** Phase 6 — one row per vehicle type that had >=1 request in range; unused types simply don't appear. */
export async function getVehicleAnalytics(supabase: SupabaseClient, start: Date, end: Date): Promise<VehicleAnalyticsRow[]> {
  return callRpc<VehicleAnalyticsRow[]>(supabase, "admin_vehicle_analytics", { p_start: start.toISOString(), p_end: end.toISOString() });
}

export interface RevenueMetrics {
  gmv: number;
  online_volume: number;
  cash_volume: number;
  driver_upi_volume: number;
  payments_captured_count: number;
  payments_failed_count: number;
  payments_pending_count: number;
  payments_refunded_amount: number;
  avg_fare: number | null;
  subscriptions_active_count: number;
  subscriptions_expired_count: number;
  subscription_revenue: number;
  subscription_payment_success_rate: number | null;
}

/** Phase 7. gmv/online_volume/cash_volume/driver_upi_volume are ride FARE volume, never Ridora's own revenue — Ridora collects zero ride commission (0007_subscriptions.sql); subscription_revenue is the only field here that is actually Ridora's own money. */
export async function getRevenueMetrics(supabase: SupabaseClient, start: Date, end: Date): Promise<RevenueMetrics> {
  return callRpcSingleRow<RevenueMetrics>(supabase, "admin_revenue_metrics", { p_start: start.toISOString(), p_end: end.toISOString() });
}

export interface KluPilotSummary {
  total_users: number;
  active_users_7d: number;
  registered_drivers: number;
  verified_drivers: number;
  completed_rides_total: number;
  completed_rides_today: number;
  completed_rides_7d: number;
  gmv_total: number;
  avg_fare: number | null;
  avg_wait_seconds: number | null;
  cancellation_rate: number | null;
  repeat_passenger_rate: number | null;
  active_safety_events: number;
  payment_success_rate: number | null;
  earliest_ride_at: string | null;
}

/** Phase 8 — top-level KLU Pilot KPIs (mostly all-time). earliest_ride_at tells the client exactly how much real history exists, so a near-empty pilot renders honestly. */
export async function getKluPilotSummary(supabase: SupabaseClient): Promise<KluPilotSummary> {
  return callRpcSingleRow<KluPilotSummary>(supabase, "admin_klu_pilot_summary");
}

export interface DailySeriesPoint {
  day: string;
  requests: number;
  completed: number;
  new_passengers: number;
  new_drivers: number;
  gmv: number;
}

/** Phase 8 charts — one row per calendar day (real zero rows for inactive days, never a gap or interpolation). */
export async function getDailySeries(supabase: SupabaseClient, days = 30): Promise<DailySeriesPoint[]> {
  return callRpc<DailySeriesPoint[]>(supabase, "admin_daily_series", { p_days: days });
}

export interface HourlyPattern {
  hour_of_day: number;
  total_requests: number;
  completed: number;
  matching_exhausted: number;
  avg_wait_seconds: number | null;
}

/** Phase 9 + 11 — one row per hour-of-day (0-23). Peak/low hours are read off total_requests, never hardcoded. matching_exhausted is the real recorded proxy for demand>supply at that hour (there's no online-driver-count history to build a true supply time series). */
export async function getHourlyPatterns(supabase: SupabaseClient, days = 30): Promise<HourlyPattern[]> {
  return callRpc<HourlyPattern[]>(supabase, "admin_hourly_patterns", { p_days: days });
}

export interface WeekdayPattern {
  weekday: number;
  weekday_label: string;
  total_requests: number;
  completed: number;
  cancelled: number;
}

/** Phase 9 — one row per weekday (0=Sunday..6=Saturday, matching PostgreSQL's EXTRACT(DOW)). */
export async function getRidesByWeekday(supabase: SupabaseClient, days = 30): Promise<WeekdayPattern[]> {
  return callRpc<WeekdayPattern[]>(supabase, "admin_rides_by_weekday", { p_days: days });
}

export interface TopLocationRow {
  kind: "pickup" | "drop";
  address: string;
  request_count: number;
}

/** Phase 10 — top pickup/drop addresses by literal free-text frequency. Real campus locations surface here only if passengers actually typed them; nothing is geofenced or hardcoded. */
export async function getTopLocations(supabase: SupabaseClient, start: Date, end: Date, limit = 10): Promise<TopLocationRow[]> {
  return callRpc<TopLocationRow[]>(supabase, "admin_top_locations", {
    p_start: start.toISOString(),
    p_end: end.toISOString(),
    p_limit: limit,
  });
}

export interface PaymentHealth {
  online_success_count: number;
  online_failure_count: number;
  online_pending_count: number;
  online_refunded_count: number;
  online_refunded_amount: number;
  webhook_events_count: number;
  webhook_unprocessed_count: number;
  subscription_paid_count: number;
  subscription_failed_count: number;
}

/** Phase 13. Cannot observe order-creation API failures that happened before any `payments` row existed (a client-side failure with no DB write to query) — that limitation is real and is not represented by any field here. */
export async function getPaymentHealth(supabase: SupabaseClient, start: Date, end: Date): Promise<PaymentHealth> {
  return callRpcSingleRow<PaymentHealth>(supabase, "admin_payment_health", { p_start: start.toISOString(), p_end: end.toISOString() });
}

export interface SafetyAnalytics {
  by_status: Record<string, number>;
  by_severity: Record<string, number>;
  by_vehicle_type: Record<string, number>;
  by_hour: Record<string, number>;
}

/** Phase 12 — extends the existing Safety dashboard with breakdowns. Admin-only, same as everything else here; never widens who can read safety_events itself. */
export async function getSafetyAnalytics(supabase: SupabaseClient, start: Date, end: Date): Promise<SafetyAnalytics> {
  return callRpc<SafetyAnalytics>(supabase, "admin_safety_analytics", { p_start: start.toISOString(), p_end: end.toISOString() });
}
