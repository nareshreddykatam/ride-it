"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, EmptyState, Skeleton } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getRideTrend,
  getSubscriberGrowth,
  getRatingsSummary,
  getCancellationRate,
  type DayBucket,
  type MonthBucket,
  type AdminRatingsSummary,
  type CancellationRateStats,
} from "@ride-it/data";
import { BarChart3 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";

export default function AnalyticsPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [rideTrend, setRideTrend] = React.useState<DayBucket[]>([]);
  const [subGrowth, setSubGrowth] = React.useState<MonthBucket[]>([]);
  const [ratings, setRatings] = React.useState<AdminRatingsSummary | null>(null);
  const [cancellation, setCancellation] = React.useState<CancellationRateStats | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user) return;
    Promise.all([getRideTrend(supabase, 7), getSubscriberGrowth(supabase, 5), getRatingsSummary(supabase), getCancellationRate(supabase, 7)])
      .then(([rt, sg, r, c]) => {
        setRideTrend(rt);
        setSubGrowth(sg);
        setRatings(r);
        setCancellation(c);
      })
      .finally(() => setLoading(false));
  }, [supabase, user]);

  const hasRideData = rideTrend.some((b) => b.count > 0);
  const hasSubData = subGrowth.some((b) => b.count > 0);

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-ink">Analytics</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Ride volume, subscriber growth, and platform health at a glance.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rides this week</CardTitle>
          </CardHeader>
          <div className="h-56">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : !hasRideData ? (
              <EmptyState icon={<BarChart3 size={20} />} title="Not enough data yet" description="Ride volume will appear here once bookings start coming in." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rideTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--ink-soft)" fontSize={12} />
                  <YAxis stroke="var(--ink-soft)" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="var(--signal-blue)" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscriber growth</CardTitle>
          </CardHeader>
          <div className="h-56">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : !hasSubData ? (
              <EmptyState icon={<BarChart3 size={20} />} title="Not enough data yet" description="Subscriber growth will appear here once drivers start subscribing." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subGrowth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--ink-soft)" fontSize={12} />
                  <YAxis stroke="var(--ink-soft)" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--marigold)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Average ratings</CardTitle>
          </CardHeader>
          {loading ? (
            <Skeleton className="h-10 w-40" />
          ) : (
            <div className="flex gap-8">
              <div>
                <p className="font-meter text-3xl text-ink">{ratings?.driverAverage?.toFixed(1) ?? "—"}</p>
                <p className="text-xs text-ink-soft">Driver average</p>
              </div>
              <div>
                <p className="font-meter text-3xl text-ink">{ratings?.passengerAverage?.toFixed(1) ?? "—"}</p>
                <p className="text-xs text-ink-soft">Passenger average</p>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cancellation rate</CardTitle>
          </CardHeader>
          {loading ? (
            <Skeleton className="h-10 w-24" />
          ) : (
            <>
              <p className="font-meter text-3xl text-ink">
                {cancellation?.ratePercent !== null && cancellation?.ratePercent !== undefined
                  ? `${cancellation.ratePercent.toFixed(1)}%`
                  : "—"}
              </p>
              <p className="text-xs text-ink-soft">
                {cancellation ? `${cancellation.cancelled} of ${cancellation.requested} requested rides` : ""} this week
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
