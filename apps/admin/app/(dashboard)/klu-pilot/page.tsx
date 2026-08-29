"use client";

import * as React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  StatCard,
  VEHICLE_VISUALS,
} from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getKluPilotSummary,
  getDailySeries,
  getPassengerMetrics,
  getDriverMetrics,
  getVehicleAnalytics,
  getRevenueMetrics,
  getHourlyPatterns,
  getRidesByWeekday,
  getTopLocations,
  type KluPilotSummary,
  type DailySeriesPoint,
  type PassengerMetrics,
  type DriverMetrics,
  type VehicleAnalyticsRow,
  type RevenueMetrics,
  type HourlyPattern,
  type WeekdayPattern,
  type TopLocationRow,
} from "@ride-it/data";
import {
  GraduationCap,
  Users,
  Car,
  IndianRupee,
  Clock,
  MapPin,
  BarChart3,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { AdminDateRangeFilter, rangeForPreset, type DateRangeValue } from "../../../components/admin-date-range";

function fmtPct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}%`;
}

function fmtSeconds(v: number | null): string {
  if (v === null) return "—";
  if (v < 60) return `${Math.round(v)}s`;
  return `${Math.round(v / 60)}m ${Math.round(v % 60)}s`;
}

function fmtInr(v: number | null): string {
  return v === null ? "—" : `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function fmtNum(v: number | null): string {
  return v === null ? "—" : v.toLocaleString("en-IN");
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(1, Math.min(400, Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1));
}

export default function KluPilotPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [summary, setSummary] = React.useState<KluPilotSummary | null>(null);
  const [daily, setDaily] = React.useState<DailySeriesPoint[]>([]);
  const [passengers, setPassengers] = React.useState<PassengerMetrics | null>(null);
  const [drivers, setDrivers] = React.useState<DriverMetrics | null>(null);
  const [vehicles, setVehicles] = React.useState<VehicleAnalyticsRow[]>([]);
  const [revenue, setRevenue] = React.useState<RevenueMetrics | null>(null);
  const [hourly, setHourly] = React.useState<HourlyPattern[]>([]);
  const [weekday, setWeekday] = React.useState<WeekdayPattern[]>([]);
  const [locations, setLocations] = React.useState<TopLocationRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [range, setRange] = React.useState<DateRangeValue>(() => {
    const { start, end } = rangeForPreset("30d");
    return { preset: "30d", start, end };
  });

  React.useEffect(() => {
    if (!user) return;
    setLoading(true);
    const days = daysBetween(range.start, range.end);
    Promise.all([
      getKluPilotSummary(supabase),
      getDailySeries(supabase, Math.max(days, 30)),
      getPassengerMetrics(supabase, range.start, range.end),
      getDriverMetrics(supabase, range.start, range.end),
      getVehicleAnalytics(supabase, range.start, range.end),
      getRevenueMetrics(supabase, range.start, range.end),
      getHourlyPatterns(supabase, days),
      getRidesByWeekday(supabase, days),
      getTopLocations(supabase, range.start, range.end, 8),
    ])
      .then(([s, d, p, dr, v, r, h, w, loc]) => {
        setSummary(s);
        setDaily(d);
        setPassengers(p);
        setDrivers(dr);
        setVehicles(v);
        setRevenue(r);
        setHourly(h);
        setWeekday(w);
        setLocations(loc);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load KLU Pilot analytics."))
      .finally(() => setLoading(false));
  }, [supabase, user, range]);

  const pickups = locations.filter((l) => l.kind === "pickup");
  const drops = locations.filter((l) => l.kind === "drop");
  const peakHour = hourly.reduce<HourlyPattern | null>((best, h) => (!best || h.total_requests > best.total_requests ? h : best), null);
  const quietHour = hourly
    .filter((h) => h.total_requests > 0)
    .reduce<HourlyPattern | null>((worst, h) => (!worst || h.total_requests < worst.total_requests ? h : worst), null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tint-marigold text-marigold-text">
            <GraduationCap size={20} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-medium text-ink">KLU Pilot</h1>
            <p className="text-sm text-ink-soft">
              {summary?.earliest_ride_at
                ? `Real data since ${new Date(summary.earliest_ride_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`
                : "No ride history yet."}
            </p>
          </div>
        </div>
        <AdminDateRangeFilter value={range} onChange={setRange} />
      </div>

      {error && <p className="mt-4 text-sm text-alert-red">{error}</p>}

      {/* Top-level KPIs — all-time, independent of the date filter above. */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading || !summary ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-7 w-14" />
            </Card>
          ))
        ) : (
          <>
            <StatCard label="Total pilot users" value={fmtNum(summary.total_users)} icon={Users} tone="blue" />
            <StatCard label="Active (last 7d)" value={fmtNum(summary.active_users_7d)} icon={Users} tone="green" />
            <StatCard label="Verified drivers" value={`${summary.verified_drivers} / ${summary.registered_drivers}`} icon={Car} tone="marigold" />
            <StatCard label="Completed rides (all-time)" value={fmtNum(summary.completed_rides_total)} icon={BarChart3} tone="blue" />
            <StatCard label="Completed today" value={fmtNum(summary.completed_rides_today)} icon={Clock} tone="green" />
            <StatCard label="GMV (all-time)" value={fmtInr(summary.gmv_total)} icon={IndianRupee} tone="marigold" />
            <StatCard label="Cancellation rate" value={fmtPct(summary.cancellation_rate)} icon={BarChart3} tone="red" />
            <StatCard label="Repeat passenger rate" value={fmtPct(summary.repeat_passenger_rate)} icon={Users} tone="violet" />
          </>
        )}
      </div>

      {/* Growth charts */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card accent="blue">
          <CardHeader>
            <CardTitle>Daily rides</CardTitle>
          </CardHeader>
          <div className="h-56">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : !daily.some((d) => d.requests > 0) ? (
              <EmptyState icon={<BarChart3 size={20} />} title="Not enough history yet" description="Requests will appear here once bookings start." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" stroke="var(--ink-soft)" fontSize={11} tickFormatter={(d) => d.slice(5)} />
                  <YAxis stroke="var(--ink-soft)" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="requests" name="Requests" stroke="var(--signal-blue)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="completed" name="Completed" stroke="var(--meter-green)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card accent="marigold">
          <CardHeader>
            <CardTitle>GMV &amp; growth</CardTitle>
          </CardHeader>
          <div className="h-56">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : !daily.some((d) => d.gmv > 0 || d.new_passengers > 0 || d.new_drivers > 0) ? (
              <EmptyState icon={<IndianRupee size={20} />} title="Not enough history yet" description="GMV and signups will appear here as the pilot grows." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" stroke="var(--ink-soft)" fontSize={11} tickFormatter={(d) => d.slice(5)} />
                  <YAxis stroke="var(--ink-soft)" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="gmv" name="GMV (₹)" fill="var(--marigold)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Passenger / Driver metrics */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Passengers</CardTitle>
          </CardHeader>
          {loading || !passengers ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-ink-soft">Registered</dt>
              <dd className="text-right tabular-nums text-ink">{fmtNum(passengers.registered_count)}</dd>
              <dt className="text-ink-soft">Active in range</dt>
              <dd className="text-right tabular-nums text-ink">{fmtNum(passengers.active_count)}</dd>
              <dt className="text-ink-soft">New in range</dt>
              <dd className="text-right tabular-nums text-ink">{fmtNum(passengers.new_count)}</dd>
              <dt className="text-ink-soft">Returning</dt>
              <dd className="text-right tabular-nums text-ink">{fmtNum(passengers.returning_count)}</dd>
              <dt className="text-ink-soft">Rides / active passenger</dt>
              <dd className="text-right tabular-nums text-ink">{passengers.avg_rides_per_active ?? "—"}</dd>
              <dt className="text-ink-soft">Avg. spend / completed ride</dt>
              <dd className="text-right tabular-nums text-ink">{fmtInr(passengers.avg_spend)}</dd>
              <dt className="text-ink-soft">Cancellation rate</dt>
              <dd className="text-right tabular-nums text-ink">{fmtPct(passengers.cancellation_rate)}</dd>
              <dt className="text-ink-soft">Repeat usage (within range)</dt>
              <dd className="text-right tabular-nums text-ink">{fmtPct(passengers.repeat_usage_rate)}</dd>
            </dl>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Drivers</CardTitle>
          </CardHeader>
          {loading || !drivers ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-ink-soft">Registered</dt>
              <dd className="text-right tabular-nums text-ink">{fmtNum(drivers.registered_count)}</dd>
              <dt className="text-ink-soft">Verified</dt>
              <dd className="text-right tabular-nums text-ink">{fmtNum(drivers.verified_count)}</dd>
              <dt className="text-ink-soft">Online now</dt>
              <dd className="text-right tabular-nums text-ink">{fmtNum(drivers.online_count)}</dd>
              <dt className="text-ink-soft">Subscribed (active)</dt>
              <dd className="text-right tabular-nums text-ink">{fmtNum(drivers.subscribed_count)}</dd>
              <dt className="text-ink-soft">Completed a ride in range</dt>
              <dd className="text-right tabular-nums text-ink">{fmtNum(drivers.completing_rides_count)}</dd>
              <dt className="text-ink-soft">Rides / active driver</dt>
              <dd className="text-right tabular-nums text-ink">{drivers.avg_rides_per_active ?? "—"}</dd>
              <dt className="text-ink-soft">Offer acceptance rate</dt>
              <dd className="text-right tabular-nums text-ink">{fmtPct(drivers.acceptance_rate)}</dd>
              <dt className="text-ink-soft">Cancellation rate</dt>
              <dd className="text-right tabular-nums text-ink">{fmtPct(drivers.cancellation_rate)}</dd>
              <dt className="flex items-center gap-1 text-ink-soft">Rides / online driver-day</dt>
              <dd className="text-right tabular-nums text-ink">{drivers.rides_per_driver_day ?? "—"}</dd>
              <dt className="text-ink-soft">Avg. earnings (wallet ledger)</dt>
              <dd className="text-right tabular-nums text-ink">{fmtInr(drivers.avg_earnings)}</dd>
            </dl>
          )}
          <p className="mt-3 text-xs text-ink-soft">
            "Rides / online driver-day" is a proxy for utilization — RideIT has no online/offline session history to compute true busy-time.
          </p>
        </Card>
      </div>

      {/* Vehicle breakdown */}
      <h2 className="mt-6 font-display text-lg font-medium text-ink">Vehicle analytics</h2>
      <Card className="mt-3 p-0">
        {loading ? (
          <div className="p-4">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : vehicles.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<Car size={20} />} title="No rides in range" description="Vehicle-level analytics will appear once requests come in." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  <th scope="col" className="px-4 py-2.5">Vehicle</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Requests</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Completed</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Cancelled</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Avg fare</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Avg distance</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Avg wait</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Acceptance</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Completion</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => {
                  const visuals = VEHICLE_VISUALS[v.vehicle_type];
                  const Icon = visuals?.icon;
                  return (
                    <tr key={v.vehicle_type} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          {Icon && (
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                              style={{ backgroundColor: visuals.tintVar, color: visuals.colorVar }}
                            >
                              <Icon size={15} />
                            </span>
                          )}
                          <span className="font-medium text-ink">{visuals?.label ?? v.vehicle_type}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">{v.requests}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">{v.completed}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">{v.cancelled}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmtInr(v.avg_fare)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">{v.avg_distance_km !== null ? `${v.avg_distance_km} km` : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmtSeconds(v.avg_wait_seconds)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmtPct(v.acceptance_rate)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmtPct(v.completion_rate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Revenue */}
      <h2 className="mt-6 font-display text-lg font-medium text-ink">Revenue</h2>
      <Card className="mt-3" accent="marigold">
        {loading || !revenue ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div>
                <p className="text-xs text-ink-soft">Ride fare volume (GMV)</p>
                <p className="font-meter text-xl font-medium text-ink">{fmtInr(revenue.gmv)}</p>
                <p className="text-[11px] text-ink-soft">Not RideIT revenue — passenger-to-driver fare volume</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Subscription revenue</p>
                <p className="font-meter text-xl font-medium text-meter-green-text">{fmtInr(revenue.subscription_revenue)}</p>
                <p className="text-[11px] text-ink-soft">RideIT's own collected revenue (0% ride commission)</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Avg. fare</p>
                <p className="font-meter text-xl font-medium text-ink">{fmtInr(revenue.avg_fare)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Subscriptions active / expired</p>
                <p className="font-meter text-xl font-medium text-ink">
                  {revenue.subscriptions_active_count} / {revenue.subscriptions_expired_count}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
              <div>
                <p className="text-xs text-ink-soft">Online (Razorpay)</p>
                <p className="tabular-nums text-ink">{fmtInr(revenue.online_volume)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Cash</p>
                <p className="tabular-nums text-ink">{fmtInr(revenue.cash_volume)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Driver UPI</p>
                <p className="tabular-nums text-ink">{fmtInr(revenue.driver_upi_volume)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Payments captured</p>
                <p className="tabular-nums text-ink">{revenue.payments_captured_count}</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Payments failed</p>
                <p className="tabular-nums text-ink">{revenue.payments_failed_count}</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Refunded</p>
                <p className="tabular-nums text-ink">{fmtInr(revenue.payments_refunded_amount)}</p>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Time patterns */}
      <h2 className="mt-6 font-display text-lg font-medium text-ink">Demand patterns</h2>
      {!loading && peakHour && quietHour && (
        <p className="mt-1 text-sm text-ink-soft">
          Peak demand: <span className="font-medium text-ink">{peakHour.hour_of_day}:00–{(peakHour.hour_of_day + 1) % 24}:00</span> ({peakHour.total_requests}{" "}
          requests). Lowest: <span className="font-medium text-ink">{quietHour.hour_of_day}:00–{(quietHour.hour_of_day + 1) % 24}:00</span> ({quietHour.total_requests}{" "}
          requests) — calculated from actual requests, not fixed windows.
        </p>
      )}
      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Requests by hour of day</CardTitle>
          </CardHeader>
          <div className="h-56">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : !hourly.some((h) => h.total_requests > 0) ? (
              <EmptyState icon={<Clock size={20} />} title="Not enough data yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="hour_of_day" stroke="var(--ink-soft)" fontSize={11} tickFormatter={(h) => `${h}h`} />
                  <YAxis stroke="var(--ink-soft)" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="total_requests" name="Requests" fill="var(--signal-blue)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="matching_exhausted" name="No drivers found" fill="var(--alert-red)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Requests by weekday</CardTitle>
          </CardHeader>
          <div className="h-56">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : !weekday.some((w) => w.total_requests > 0) ? (
              <EmptyState icon={<Clock size={20} />} title="Not enough data yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekday}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="weekday_label" stroke="var(--ink-soft)" fontSize={12} />
                  <YAxis stroke="var(--ink-soft)" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="total_requests" name="Requests" fill="var(--violet)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Locations */}
      <h2 className="mt-6 font-display text-lg font-medium text-ink">Top locations</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <MapPin size={15} className="mr-1.5 inline text-signal-blue" />
              Top pickups
            </CardTitle>
          </CardHeader>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : pickups.length === 0 ? (
            <p className="text-sm text-ink-soft">No pickups recorded in range.</p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {pickups.map((l, i) => (
                <li key={l.address} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-ink">
                    <span className="mr-2 text-ink-soft">{i + 1}.</span>
                    {l.address}
                  </span>
                  <span className="shrink-0 tabular-nums text-ink-soft">{l.request_count}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <MapPin size={15} className="mr-1.5 inline text-alert-red" />
              Top destinations
            </CardTitle>
          </CardHeader>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : drops.length === 0 ? (
            <p className="text-sm text-ink-soft">No destinations recorded in range.</p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {drops.map((l, i) => (
                <li key={l.address} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-ink">
                    <span className="mr-2 text-ink-soft">{i + 1}.</span>
                    {l.address}
                  </span>
                  <span className="shrink-0 tabular-nums text-ink-soft">{l.request_count}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
