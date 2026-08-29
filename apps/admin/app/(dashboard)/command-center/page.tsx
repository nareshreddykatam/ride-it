"use client";

import * as React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  LiveStatBand,
  Skeleton,
  StatCard,
  StatusPill,
  DriverIcon,
  PassengerIcon,
  RideIcon,
  SafetyIcon,
} from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getLiveOpsSnapshot,
  getRideFunnel,
  getPaymentHealth,
  type LiveOpsSnapshot,
  type RideFunnel,
  type PaymentHealth,
} from "@ride-it/data";
import { Activity, Percent, ShieldAlert, Timer, UserCheck } from "lucide-react";
import { AdminDateRangeFilter, rangeForPreset, type DateRangeValue } from "../../../components/admin-date-range";

function fmtPct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}%`;
}

function fmtSeconds(v: number | null): string {
  if (v === null) return "—";
  if (v < 60) return `${Math.round(v)}s`;
  return `${Math.round(v / 60)}m ${Math.round(v % 60)}s`;
}

const FUNNEL_STAGES = [
  { key: "requested_count", label: "Requested" },
  { key: "matched_count", label: "Matching (offers made)" },
  { key: "accepted_count", label: "Driver accepted" },
  { key: "driver_arriving_count", label: "Driver arriving" },
  { key: "ride_started_count", label: "Ride started" },
  { key: "completed_count", label: "Completed" },
] as const;

type HealthStatus = "healthy" | "warning" | "configuration_required" | "unavailable";

const HEALTH_TONE: Record<HealthStatus, "online" | "pending" | "alert" | "offline"> = {
  healthy: "online",
  warning: "pending",
  configuration_required: "alert",
  unavailable: "offline",
};

const HEALTH_LABEL: Record<HealthStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  configuration_required: "Configuration required",
  unavailable: "Unavailable",
};

function HealthRow({ label, status, detail }: { label: string; status: HealthStatus; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-xs text-ink-soft">{detail}</p>
      </div>
      <StatusPill tone={HEALTH_TONE[status]}>{HEALTH_LABEL[status]}</StatusPill>
    </div>
  );
}

export default function CommandCenterPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [snapshot, setSnapshot] = React.useState<LiveOpsSnapshot | null>(null);
  const [funnel, setFunnel] = React.useState<RideFunnel | null>(null);
  const [paymentHealth, setPaymentHealth] = React.useState<PaymentHealth | null>(null);
  const [appConfig, setAppConfig] = React.useState<{ maps: boolean; payments: boolean } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [range, setRange] = React.useState<DateRangeValue>(() => {
    const { start, end } = rangeForPreset("today");
    return { preset: "today", start, end };
  });

  const refreshLive = React.useCallback(async () => {
    try {
      setSnapshot(await getLiveOpsSnapshot(supabase));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load live metrics.");
    }
  }, [supabase]);

  React.useEffect(() => {
    if (!user) return;
    Promise.all([
      getLiveOpsSnapshot(supabase),
      getRideFunnel(supabase, range.start, range.end),
      getPaymentHealth(supabase, range.start, range.end),
      fetch("/api/system-health")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([snap, fn, ph, config]) => {
        setSnapshot(snap);
        setFunnel(fn);
        setPaymentHealth(ph);
        setAppConfig(config);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load Command Center data."))
      .finally(() => setLoading(false));
  }, [supabase, user, range]);

  // Live strip refreshes on its own short interval — everything else
  // (funnel, payment health) only refetches when the date range changes,
  // so this never turns into a per-second poll against range-scoped
  // aggregates.
  React.useEffect(() => {
    if (!user) return;
    const interval = setInterval(refreshLive, 30_000);
    return () => clearInterval(interval);
  }, [user, refreshLive]);

  const maxFunnelCount = funnel ? Math.max(funnel.requested_count, 1) : 1;

  const webhookStatus: HealthStatus =
    paymentHealth === null
      ? "unavailable"
      : paymentHealth.webhook_unprocessed_count > 0
        ? "warning"
        : paymentHealth.webhook_events_count > 0
          ? "healthy"
          : "unavailable";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tint-blue text-signal-blue">
            <Activity size={20} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-medium text-ink">Command Center</h1>
            <p className="text-sm text-ink-soft">What's happening on RideIT right now.</p>
          </div>
        </div>
        {snapshot && (
          <p className="text-xs text-ink-soft">
            Live figures as of {new Date(snapshot.snapshot_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
            {" · "}matching/wait figures are a trailing-24h window, refreshes every 30s
          </p>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-alert-red">{error}</p>}

      {loading ? (
        <Skeleton className="mt-6 h-28 w-full" />
      ) : (
        <LiveStatBand
          className="mt-6"
          eyebrow="Live now"
          items={[
            { label: "Active rides", value: String(snapshot?.active_rides ?? 0), icon: RideIcon, tone: "blue" },
            { label: "Drivers online", value: String(snapshot?.drivers_online ?? 0), icon: DriverIcon, tone: "green" },
            { label: "Passengers riding", value: String(snapshot?.passengers_riding ?? 0), icon: PassengerIcon, tone: "violet" },
            { label: "Open requests", value: String(snapshot?.open_ride_requests ?? 0), icon: Timer, tone: "marigold" },
            { label: "Drivers available", value: String(snapshot?.drivers_available ?? 0), icon: UserCheck, tone: "green" },
            { label: "Active safety events", value: String(snapshot?.active_safety_events ?? 0), icon: SafetyIcon, tone: "red" },
          ]}
        />
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-7 w-16" />
            </Card>
          ))
        ) : (
          <>
            <StatCard
              label="Matching success (24h)"
              value={fmtPct(snapshot?.matching_success_rate_24h ?? null)}
              icon={Percent}
              tone="blue"
            />
            <StatCard label="Avg. wait to match (24h)" value={fmtSeconds(snapshot?.avg_wait_seconds_24h ?? null)} icon={Timer} tone="marigold" />
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-medium text-ink">Ride funnel</h2>
        <AdminDateRangeFilter value={range} onChange={setRange} />
      </div>

      <Card className="mt-3" accent="blue">
        {loading || !funnel ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {FUNNEL_STAGES.map((stage) => {
                    const count = funnel[stage.key];
                    const pct = Math.round((count / maxFunnelCount) * 100);
                    return (
                      <tr key={stage.key}>
                        <th scope="row" className="w-40 py-1.5 pr-3 text-left text-xs font-medium text-ink-soft">
                          {stage.label}
                        </th>
                        <td className="py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="h-5 flex-1 overflow-hidden rounded bg-ink/5">
                              <div className="h-full rounded bg-signal-blue" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-10 shrink-0 text-right font-meter text-sm tabular-nums text-ink">{count}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <th scope="row" className="w-40 py-1.5 pr-3 text-left text-xs font-medium text-alert-red-text">
                      Cancelled (user)
                    </th>
                    <td className="py-1.5 text-sm tabular-nums text-ink">{funnel.cancelled_user_count}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="w-40 py-1.5 pr-3 text-left text-xs font-medium text-alert-red-text">
                      Cancelled (no drivers found)
                    </th>
                    <td className="py-1.5 text-sm tabular-nums text-ink">{funnel.cancelled_no_drivers_count}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 lg:grid-cols-4">
              <div>
                <p className="text-xs text-ink-soft">Acceptance rate</p>
                <p className="font-meter text-lg font-medium text-ink">{fmtPct(funnel.acceptance_rate)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Completion rate</p>
                <p className="font-meter text-lg font-medium text-ink">{fmtPct(funnel.completion_rate)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Cancellation rate</p>
                <p className="font-meter text-lg font-medium text-ink">{fmtPct(funnel.cancellation_rate)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Matching timeout rate</p>
                <p className="font-meter text-lg font-medium text-ink">{fmtPct(funnel.matching_timeout_rate)}</p>
              </div>
            </div>
          </>
        )}
      </Card>

      <h2 className="mt-6 font-display text-lg font-medium text-ink">System health</h2>
      <Card className="mt-3 p-0">
        <div className="px-4">
          <HealthRow label="Database" status="healthy" detail="Reachable — this page loaded from live queries." />
          <HealthRow
            label="Google Maps"
            status={appConfig === null ? "unavailable" : appConfig.maps ? "healthy" : "configuration_required"}
            detail={appConfig === null ? "Could not check." : appConfig.maps ? "API key configured." : "No API key set — apps fall back to the demo map."}
          />
          <HealthRow
            label="Payment gateway (Razorpay)"
            status={appConfig === null ? "unavailable" : appConfig.payments ? "healthy" : "configuration_required"}
            detail={appConfig === null ? "Could not check." : appConfig.payments ? "Credentials configured." : "No credentials set — Ride It Online is unavailable to passengers."}
          />
          <HealthRow
            label="SMS (MSG91) / Push (FCM)"
            status="unavailable"
            detail="Not observable from this app — these are Supabase Edge Function secrets, invisible to any Next.js app. Check Supabase project → Edge Functions → Secrets."
          />
          <HealthRow
            label="Payment webhooks"
            status={webhookStatus}
            detail={
              paymentHealth === null
                ? "Could not check."
                : paymentHealth.webhook_unprocessed_count > 0
                  ? `${paymentHealth.webhook_unprocessed_count} event(s) unprocessed for over 10 minutes in the selected range.`
                  : `${paymentHealth.webhook_events_count} event(s) received in the selected range, all processed.`
            }
          />
        </div>
      </Card>
    </div>
  );
}
