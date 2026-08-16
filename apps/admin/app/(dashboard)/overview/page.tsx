"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, MeterValue, Skeleton, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getAdminOverviewStats, type AdminOverviewStats } from "@ride-it/data";

export default function OverviewPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [stats, setStats] = React.useState<AdminOverviewStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    getAdminOverviewStats(supabase)
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load overview stats."))
      .finally(() => setLoading(false));
  }, [supabase, user]);

  const STAT_CARDS = stats
    ? [
        { label: "Drivers online", value: stats.driversOnline.toLocaleString("en-IN") },
        { label: "Rides today", value: stats.ridesToday.toLocaleString("en-IN") },
        { label: "Active subscriptions", value: stats.activeSubscriptions.toLocaleString("en-IN") },
        { label: "Open complaints", value: stats.openSupportTickets.toLocaleString("en-IN") },
      ]
    : [];

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-ink">Overview</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Platform snapshot across drivers, rides, subscriptions, and complaints.
      </p>

      {error && <p className="mt-4 text-sm text-alert-red">{error}</p>}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-7 w-16" />
            </Card>
          ))}
        {!loading &&
          STAT_CARDS.map((stat) => (
            <Card key={stat.label}>
              <p className="text-xs text-ink-soft">{stat.label}</p>
              <p className="mt-1 font-meter text-2xl font-medium text-ink">{stat.value}</p>
            </Card>
          ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
            <StatusPill tone="info">This month</StatusPill>
          </CardHeader>
          {/* Subscription revenue (what Ride It actually collects) shown
              separately from ride fare volume (analytics only — Ride It
              takes no commission from passenger fares, per product policy). */}
          {loading ? (
            <div className="flex gap-8">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-28" />
            </div>
          ) : (
            <div className="flex gap-8">
              <MeterValue
                value={`₹${(stats?.subscriptionRevenueThisMonth ?? 0).toLocaleString("en-IN")}`}
                label="Subscription revenue (collected)"
              />
              <MeterValue
                value={`₹${(stats?.rideFareVolumeThisMonth ?? 0).toLocaleString("en-IN")}`}
                label="Ride fare volume (analytics only)"
              />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent complaints</CardTitle>
          </CardHeader>
          <p className="text-sm text-ink-soft">
            {loading
              ? "Loading…"
              : stats && stats.openSupportTickets > 0
                ? `${stats.openSupportTickets} open support ticket${stats.openSupportTickets === 1 ? "" : "s"} awaiting a response.`
                : "No open complaints right now."}
          </p>
          <Link href="/passengers" className="mt-3 inline-block text-xs font-medium text-signal-blue">
            View passengers →
          </Link>
        </Card>
      </div>
    </div>
  );
}
