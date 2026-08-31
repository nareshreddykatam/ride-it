"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, Skeleton, StatusPill } from "@ride-it/ui";
import { Gift } from "lucide-react";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getAdminReferralSummary, type AdminReferralSummary } from "@ride-it/data";

function StatCard({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "green" | "marigold" | "blue" }) {
  return (
    <Card accent={tone}>
      <p className="font-display text-2xl font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{label}</p>
    </Card>
  );
}

export default function AdminReferralsPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [summary, setSummary] = React.useState<AdminReferralSummary | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user) return;
    getAdminReferralSummary(supabase)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [supabase, user]);

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tint-marigold text-marigold-text">
          <Gift size={20} />
        </span>
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">Referrals</h1>
          <p className="text-sm text-ink-soft">
            Passenger↔driver referral performance across all four combinations. Configure reward amounts in Settings.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total referrals" value={summary?.totalReferrals ?? 0} />
            <StatCard label="Conversion rate" value={summary?.conversionRate != null ? `${summary.conversionRate}%` : "—"} tone="blue" />
            <StatCard label="Total rewards paid" value={`₹${summary?.totalRewardsPaid ?? 0}`} tone="green" />
            <StatCard
              label="Avg. time to qualify"
              value={summary?.avgQualificationHours != null ? `${summary.avgQualificationHours}h` : "—"}
              tone="marigold"
            />
          </div>

          <p className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-ink-soft">By referral type</p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Passenger → Passenger" value={summary?.passengerToPassengerCount ?? 0} />
            <StatCard label="Passenger → Driver" value={summary?.passengerToDriverCount ?? 0} />
            <StatCard label="Driver → Passenger" value={summary?.driverToPassengerCount ?? 0} />
            <StatCard label="Driver → Driver" value={summary?.driverToDriverCount ?? 0} />
          </div>

          <p className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-ink-soft">By status</p>
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill tone="pending">Attributed: {summary?.attributedCount ?? 0}</StatusPill>
              <StatusPill tone="online">Qualified: {summary?.qualifiedCount ?? 0}</StatusPill>
              <StatusPill tone="verified">Rewarded: {summary?.rewardedCount ?? 0}</StatusPill>
              <StatusPill tone="alert">Expired: {summary?.expiredCount ?? 0}</StatusPill>
            </div>
          </Card>

          {summary?.totalReferrals === 0 && (
            <Card className="mt-6 text-center">
              <CardHeader>
                <CardTitle>No referrals yet</CardTitle>
              </CardHeader>
              <p className="text-sm text-ink-soft">
                Once referrals are enabled (Settings → Referral rewards) and passengers/drivers start sharing their
                codes, activity will show up here.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
