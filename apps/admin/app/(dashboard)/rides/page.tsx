"use client";

import * as React from "react";
import Link from "next/link";
import { MeterValue, RideIcon, StatusPill, VEHICLE_VISUALS } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listLiveRidesAdmin, subscribeToAllRideChanges, errorMessage, type AdminRideListRow } from "@ride-it/data";
import { DataTable, type Column } from "../../../components/data-table";

const STATUS_TONE: Record<string, "pending" | "info" | "online" | "offline" | "alert"> = {
  requested: "pending",
  matched: "info",
  accepted: "info",
  driver_arriving: "info",
  otp_verified: "info",
  ride_started: "info",
  destination_reached: "info",
  payment_collected: "info",
  ride_completed: "online",
  payment: "online",
  cancelled: "alert",
  rated: "online",
};

const columns: Column<AdminRideListRow>[] = [
  {
    key: "id",
    header: "Ride",
    render: (row) => (
      <Link href={`/rides/${row.id}`} className="font-medium text-ink hover:text-signal-blue">
        #{row.id.slice(0, 8)}
      </Link>
    ),
  },
  { key: "passenger", header: "Passenger", render: (row) => row.passenger_name ?? "—" },
  { key: "driver", header: "Driver", render: (row) => row.driver_name ?? "Unassigned" },
  {
    key: "vehicle",
    header: "Vehicle",
    render: (row) => {
      const visual = VEHICLE_VISUALS[row.vehicle_type];
      const Icon = visual.icon;
      return (
        <span className="flex items-center gap-1.5">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{ backgroundColor: visual.tintVar, color: visual.colorVar }}
          >
            <Icon size={14} />
          </span>
          {visual.label}
        </span>
      );
    },
  },
  { key: "fare", header: "Fare", render: (row) => <MeterValue value={`₹${row.total_fare}`} size="sm" /> },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusPill tone={STATUS_TONE[row.status] ?? "info"}>{row.status.replace("_", " ")}</StatusPill>,
  },
];

export default function RidesPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [rides, setRides] = React.useState<AdminRideListRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    listLiveRidesAdmin(supabase)
      .then(setRides)
      .catch((e) => setError(errorMessage(e) ?? "Couldn't load live rides."))
      .finally(() => setLoading(false));
  }, [supabase]);

  React.useEffect(() => {
    if (!user) return;
    refresh();
    // Realtime: refetch the live list whenever any ride changes, so
    // newly-requested/matched/accepted/completed rides reflect without a
    // manual reload. Admin RLS (rides_all_admin) already grants full
    // visibility — this mirrors that at the realtime layer, it doesn't
    // grant anything new.
    const unsubscribe = subscribeToAllRideChanges(supabase, refresh);
    return unsubscribe;
  }, [supabase, user, refresh]);

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tint-marigold text-marigold-text">
          <RideIcon size={20} />
        </span>
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">Live Rides</h1>
          <p className="text-sm text-ink-soft">
            Monitor active rides, cancel or reassign, and investigate disputes.
          </p>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-alert-red">{error}</p>}
      <div className="mt-6">
        <DataTable
          columns={columns}
          rows={rides}
          keyField={(r) => r.id}
          loading={loading}
          emptyLabel="No live rides right now"
          ariaLabel="Live rides table"
        />
      </div>
    </div>
  );
}
