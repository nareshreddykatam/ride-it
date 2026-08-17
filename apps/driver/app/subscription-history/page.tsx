"use client";

import * as React from "react";
import { Card, EmptyState, SkeletonRow, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listDriverSubscriptions, type SubscriptionRow } from "@ride-it/data";
import { Receipt } from "lucide-react";

const STATUS_TONE: Record<SubscriptionRow["status"], "online" | "pending" | "alert"> = {
  active: "online",
  grace_period: "pending",
  expired: "alert",
  cancelled: "alert",
};

const STATUS_LABEL: Record<SubscriptionRow["status"], string> = {
  active: "ACTIVE",
  grace_period: "GRACE PERIOD",
  expired: "EXPIRED",
  cancelled: "CANCELLED",
};

const PLAN_LABEL: Record<SubscriptionRow["plan"], string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function DriverSubscriptionHistoryPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [subscriptions, setSubscriptions] = React.useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    let active = true;
    listDriverSubscriptions(supabase, user.id)
      .then((s) => active && setSubscriptions(s))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Couldn't load your subscription history."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [supabase, user]);

  const current = subscriptions.find((s) => s.status === "active");
  const past = subscriptions.filter((s) => s.status !== "active");

  return (
    <main className="flex-1 px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Subscription history</h1>

      <div className="mt-4 flex flex-col gap-3">
        {loading && Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}

        {!loading && error && (
          <Card className="border-alert-red bg-alert-red/5">
            <p className="text-sm text-ink">Couldn&apos;t load your subscription history.</p>
            <p className="mt-1 text-xs text-ink-soft">{error}</p>
          </Card>
        )}

        {!loading && !error && subscriptions.length === 0 && (
          <EmptyState
            icon={<Receipt size={20} />}
            title="No subscriptions yet"
            description="Your subscription purchases will show up here once you buy a plan."
          />
        )}

        {!loading && !error && current && (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase text-ink-soft">Current subscription</p>
            <SubscriptionCard sub={current} />
          </div>
        )}

        {!loading && !error && past.length > 0 && (
          <div className={current ? "mt-2" : undefined}>
            <p className="mb-1.5 text-xs font-medium uppercase text-ink-soft">Past subscriptions</p>
            <div className="flex flex-col gap-3">
              {past.map((s) => (
                <SubscriptionCard key={s.id} sub={s} />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function SubscriptionCard({ sub }: { sub: SubscriptionRow }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink">{PLAN_LABEL[sub.plan]} plan</p>
          <p className="text-xs text-ink-soft">
            {formatDate(sub.starts_at)} → {formatDate(sub.expires_at)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-meter text-sm text-ink">₹{sub.amount}</p>
          <StatusPill tone={STATUS_TONE[sub.status]} dot={false} className="mt-1">
            {STATUS_LABEL[sub.status]}
          </StatusPill>
        </div>
      </div>
    </Card>
  );
}
