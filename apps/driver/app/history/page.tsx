"use client";

import * as React from "react";
import { Card, EmptyState, SkeletonRow, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listDriverRides, type RideRow } from "@ride-it/data";
import { Clock } from "lucide-react";

const COMPLETED_STATUSES = new Set(["ride_completed", "rated"]);

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  driver_upi: "UPI",
  online: "Online",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statusLabel(status: RideRow["status"]): string {
  if (status === "cancelled") return "CANCELLED";
  if (COMPLETED_STATUSES.has(status)) return "COMPLETED";
  return "IN PROGRESS";
}

export default function DriverHistoryPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [rides, setRides] = React.useState<RideRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    let active = true;
    listDriverRides(supabase, user.id)
      .then((r) => active && setRides(r))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Couldn't load your ride history."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [supabase, user]);

  return (
    <main className="flex-1 px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Ride history</h1>

      <div className="mt-4 flex flex-col gap-3">
        {loading && Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}

        {!loading && error && (
          <Card className="border-alert-red bg-alert-red/5">
            <p className="text-sm text-ink">Couldn&apos;t load your ride history.</p>
            <p className="mt-1 text-xs text-ink-soft">{error}</p>
          </Card>
        )}

        {!loading && !error && rides.length === 0 && (
          <EmptyState
            icon={<Clock size={20} />}
            title="No rides yet"
            description="Your completed and cancelled rides will show up here."
          />
        )}

        {!loading &&
          !error &&
          rides.map((ride) => (
            <Card key={ride.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-ink">
                    {ride.pickup_address ?? "Pickup"} → {ride.drop_address ?? "Drop"}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {formatDate(ride.requested_at)} · {ride.vehicle_type === "auto" ? "Auto" : "Bike"}
                    {ride.payment_method ? ` · ${PAYMENT_METHOD_LABEL[ride.payment_method] ?? ride.payment_method}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-meter text-sm text-ink">₹{ride.total_fare}</p>
                  <StatusPill tone={ride.status === "cancelled" ? "alert" : "online"} dot={false} className="mt-1">
                    {statusLabel(ride.status)}
                  </StatusPill>
                </div>
              </div>
            </Card>
          ))}
      </div>
    </main>
  );
}
