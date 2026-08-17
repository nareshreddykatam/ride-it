"use client";

import * as React from "react";
import { Card, EmptyState, SkeletonRow, StatusPill, VEHICLE_VISUALS } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listPassengerRides, type RideRow } from "@ride-it/data";
import { Clock } from "lucide-react";

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

  return (
    <main className="flex-1 px-6 py-8">
      <h1 className="font-display text-2xl font-semibold text-ink">Ride history</h1>

      <div className="mt-4 flex flex-col gap-3">
        {loading &&
          Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}

        {!loading && rides.length === 0 && (
          <EmptyState
            icon={<Clock size={20} />}
            title="No rides yet"
            description="Your completed and cancelled rides will show up here."
          />
        )}

        {!loading &&
          rides.map((ride) => {
            const visual = VEHICLE_VISUALS[ride.vehicle_type];
            const VehicleIcon = visual.icon;
            return (
              <Card key={ride.id} tone="elevated">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: visual.tintVar, color: visual.colorVar }}
                  >
                    <VehicleIcon size={20} strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">
                      {ride.pickup_address ?? "Pickup"} → {ride.drop_address ?? "Drop"}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {formatDate(ride.requested_at)} · {visual.label}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-meter text-sm text-ink">₹{ride.total_fare}</p>
                    <StatusPill
                      tone={ride.status === "cancelled" ? "alert" : "online"}
                      dot={false}
                      className="mt-1"
                    >
                      {statusLabel(ride.status)}
                    </StatusPill>
                  </div>
                </div>
              </Card>
            );
          })}
      </div>
    </main>
  );
}
