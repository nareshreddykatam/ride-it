"use client";

import * as React from "react";
import Link from "next/link";
import { StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listLiveRidesAdmin, subscribeToAllRideChanges, type AdminRideListRow } from "@ride-it/data";
import { DataTable, type Column } from "../../../components/data-table";

const STATUS_TONE: Record<string, "pending" | "info" | "online" | "offline" | "alert"> = {
  requested: "pending",
  matched: "info",
  accepted: "info",
  driver_arriving: "info",
  otp_verified: "info",
  ride_started: "info",
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
  { key: "vehicle", header: "Vehicle", render: (row) => (row.vehicle_type === "auto" ? "Auto" : "Bike") },
  { key: "fare", header: "Fare", render: (row) => <span className="font-meter">₹{row.total_fare}</span> },
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
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load live rides."))
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
      <h1 className="font-display text-2xl font-medium text-ink">Live Rides</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Monitor active rides, cancel or reassign, and investigate disputes.
      </p>
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
