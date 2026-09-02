"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ShieldAlert, Users } from "lucide-react";
import { Card, CardHeader, CardTitle, DriverIcon, HomeIcon, LiveStatBand, MeterValue, PaymentIcon, RideIcon, SafetyIcon, Skeleton, StatusPill } from "@ride-it/ui";
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

  // One unified operations-center readout instead of four identical boxed
  // StatCards — this is the "LIVE NOW / 128 ACTIVE RIDES / 342 ONLINE
  // DRIVERS / ..." headline strip. Same real metrics as before, just
  // recomposed as a single band (see LiveStatBand — packages/ui).
  const LIVE_ITEMS = stats
    ? [
        {
          label: "Rides today",
          value: stats.ridesToday.toLocaleString("en-IN"),
          icon: RideIcon,
          tone: "blue" as const,
        },
        {
          label: "Drivers online",
          value: stats.driversOnline.toLocaleString("en-IN"),
          icon: DriverIcon,
          tone: "green" as const,
        },
        {
          label: "Open complaints",
          value: stats.openSupportTickets.toLocaleString("en-IN"),
          icon: ShieldAlert,
          tone: "red" as const,
        },
        {
          label: "Active subscriptions",
          value: stats.activeSubscriptions.toLocaleString("en-IN"),
          icon: PaymentIcon,
          tone: "marigold" as const,
        },
      ]
    : [];

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tint-blue text-signal-blue">
          <HomeIcon size={20} />
        </span>
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">Overview</h1>
          <p className="text-sm text-ink-soft">
            Platform snapshot across drivers, rides, subscriptions, and complaints.
          </p>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-alert-red">{error}</p>}

      {loading ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <Skeleton className="h-3 w-20" />
          <div className="mt-4 flex flex-wrap gap-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-7 w-16" />
                <Skeleton className="mt-2 h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <LiveStatBand className="mt-6" items={LIVE_ITEMS} />
      )}

      {/* Operational bento: revenue gets the wide cell (it's the number
          leadership actually reads first), complaints + quick jump-offs
          fill the narrow column — dense but each cell answers one question. */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card tone="elevated" accent="marigold" className="lg:col-span-2">
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
            <div className="flex flex-wrap gap-8">
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

        <Card accent="red">
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

        <Card tone="outline" className="lg:col-span-2">
          <CardTitle className="mb-1">Quick operations</CardTitle>
          <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              { href: "/rides", label: "Live rides", icon: RideIcon, tone: "text-signal-blue bg-tint-blue" },
              { href: "/drivers", label: "Drivers", icon: DriverIcon, tone: "text-meter-green-text bg-meter-green/10" },
              { href: "/support", label: "Support queue", icon: Users, tone: "text-marigold-text bg-tint-marigold" },
              { href: "/safety", label: "Safety", icon: SafetyIcon, tone: "text-alert-red-text bg-alert-red/10" },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 transition-all hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-sm"
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${action.tone}`}>
                  <action.icon size={16} aria-hidden="true" />
                </span>
                <span className="flex items-center gap-1 text-xs font-semibold text-ink">
                  {action.label}
                  <ArrowRight size={12} className="text-ink-soft" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
