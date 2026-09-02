"use client";

import * as React from "react";
import Link from "next/link";
import { RideIcon, StatusPill, VEHICLE_VISUALS, EmptyState, SkeletonRow } from "@ride-it/ui";
import { ChevronRight, Clock } from "lucide-react";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listPassengerRides, type RideRow } from "@ride-it/data";

const COMPLETED_STATUSES = new Set(["ride_completed", "rated"]);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statusLabel(status: RideRow["status"]): string {
  if (status === "cancelled") return "CANCELLED";
  if (COMPLETED_STATUSES.has(status)) return "COMPLETED";
  return "IN PROGRESS";
}

export default function HistoryPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [rides, setRides] = React.useState<RideRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user) return;
    let active = true;
    listPassengerRides(supabase, user.id)
      .then((r) => active && setRides(r))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [supabase, user]);

  // Real, derived-from-actual-rides totals only — no separate "stats" data
  // source, and cancelled rides never count toward spend.
  const completedRides = rides.filter((r) => r.status !== "cancelled");
  const totalSpent = completedRides.reduce((sum, r) => sum + (r.total_fare ?? 0), 0);

  return (
    <main className="flex-1 px-6 py-8">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tint-blue text-signal-blue">
          <RideIcon size={20} aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Ride history</h1>
          <p className="text-sm text-ink-soft">Every trip you&apos;ve taken with Ridora.</p>
        </div>
      </div>

      {/* Summary strip — only real totals derived from the rides already
          loaded below, never a separate/estimated stats call. */}
      {!loading && rides.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <p className="font-meter text-2xl font-bold tabular-nums text-ink">{rides.length}</p>
            <p className="mt-0.5 text-xs font-medium text-ink-soft">Total rides</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <p className="font-meter text-2xl font-bold tabular-nums text-ink">₹{totalSpent.toFixed(0)}</p>
            <p className="mt-0.5 text-xs font-medium text-ink-soft">Total spent</p>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3">
        {loading &&
          Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}

        {!loading && rides.length === 0 && (
          <EmptyState
            icon={<Clock size={20} />}
            title="No rides yet"
            description="Book your first Ridora trip and it'll show up here."
          />
        )}

        {!loading &&
          rides.map((ride) => {
            const visual = VEHICLE_VISUALS[ride.vehicle_type];
            const VehicleIcon = visual.icon;
            const cancelled = ride.status === "cancelled";
            return (
              <Link key={ride.id} href={`/history/${ride.id}`}>
                <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-md active:translate-y-0">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: visual.tintVar, color: visual.colorVar }}
                  >
                    <VehicleIcon size={26} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {ride.pickup_address ?? "Pickup"} → {ride.drop_address ?? "Drop"}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {formatDate(ride.requested_at)} · {visual.label}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-meter text-sm font-bold text-ink">
                      {cancelled ? "—" : `₹${ride.total_fare}`}
                    </p>
                    <StatusPill tone={cancelled ? "alert" : "online"} dot={false} className="mt-1">
                      {statusLabel(ride.status)}
                    </StatusPill>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-ink-soft" aria-hidden="true" />
                </div>
              </Link>
            );
          })}
      </div>
    </main>
  );
}
