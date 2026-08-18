"use client";

import * as React from "react";
import { Card, EmptyState, MeterValue, SkeletonRow, cn } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getDriverEarningsSummary, type EarningsRange, type RideRow } from "@ride-it/data";
import { TrendingUp } from "lucide-react";

const RANGES: { key: EarningsRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export default function EarningsPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [range, setRange] = React.useState<EarningsRange>("today");
  const [loading, setLoading] = React.useState(true);
  const [total, setTotal] = React.useState(0);
  const [rides, setRides] = React.useState<RideRow[]>([]);

  React.useEffect(() => {
    if (!user) return;
    setLoading(true);
    getDriverEarningsSummary(supabase, user.id, range)
      .then((summary) => {
        setTotal(summary.totalEarnings);
        setRides(summary.rides);
      })
      .finally(() => setLoading(false));
  }, [supabase, user, range]);

  const rangeLabel = RANGES.find((r) => r.key === range)!.label;

  return (
    <main className="flex-1 px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Earnings</h1>

      <div className="mt-4 flex gap-2" role="tablist" aria-label="Earnings range">
        {RANGES.map((r) => (
          <button
            key={r.key}
            role="tab"
            aria-selected={range === r.key}
            onClick={() => setRange(r.key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              range === r.key ? "bg-signal-blue text-white shadow-sm" : "bg-ink/5 text-ink-soft"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <Card tone="elevated" accent="marigold" className="mt-4">
        <MeterValue value={`₹${total}`} label={`Total earned — ${rangeLabel.toLowerCase()}`} size="lg" />
        <p className="mt-2 text-xs text-ink-soft">{rides.length} rides completed</p>
      </Card>

      <div className="mt-6 flex flex-col gap-3">
        {loading && Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}

        {!loading && rides.length === 0 && (
          <EmptyState
            icon={<TrendingUp size={20} />}
            title="No earnings yet"
            description="Completed rides for this period will show up here."
          />
        )}

        {!loading && rides.length > 0 && (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface px-4 shadow-sm">
            {rides.map((ride) => (
              <div key={ride.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">
                    {ride.pickup_address ?? "Pickup"} → {ride.drop_address ?? "Drop"}
                  </p>
                  <p className="text-xs text-ink-soft">{formatTime(ride.requested_at)}</p>
                </div>
                <span className="shrink-0 font-meter text-sm font-medium text-meter-green-text">₹{ride.total_fare}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-ink-soft">
        Since drivers keep 100% of every fare, this is the driver&apos;s
        actual take-home — no commission is deducted anywhere in this view.
      </p>
    </main>
  );
}
