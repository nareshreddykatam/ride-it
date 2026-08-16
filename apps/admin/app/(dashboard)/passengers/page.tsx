"use client";

import * as React from "react";
import Link from "next/link";
import { StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listPassengersAdmin, type AdminPassengerListRow } from "@ride-it/data";
import { DataTable, type Column } from "../../../components/data-table";

const columns: Column<AdminPassengerListRow>[] = [
  {
    key: "name",
    header: "Passenger",
    render: (row) => (
      <Link href={`/passengers/${row.id}`} className="font-medium text-ink hover:text-signal-blue">
        {row.full_name ?? "Unnamed passenger"}
      </Link>
    ),
  },
  { key: "phone", header: "Phone", render: (row) => (row.phone ? `+91 ${row.phone}` : "—") },
  { key: "totalRides", header: "Total rides", render: (row) => row.total_rides },
  { key: "rating", header: "Rating", render: (row) => (row.rating > 0 ? `★ ${row.rating.toFixed(1)}` : "—") },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusPill tone={row.is_active ? "online" : "alert"}>{row.is_active ? "Active" : "Suspended"}</StatusPill>,
  },
];

export default function PassengersPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [passengers, setPassengers] = React.useState<AdminPassengerListRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    if (!user) return;
    setLoading(true);
    listPassengersAdmin(supabase, { search: search || undefined })
      .then(setPassengers)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load passengers."))
      .finally(() => setLoading(false));
  }, [supabase, user, search]);

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-ink">Passengers</h1>
      <p className="mt-1 text-sm text-ink-soft">
        View ride history, handle complaints, and manage account suspensions.
      </p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name or phone"
        className="mt-4 h-9 w-56 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-signal-blue"
      />

      {error && <p className="mt-3 text-sm text-alert-red">{error}</p>}

      <div className="mt-4">
        <DataTable columns={columns} rows={passengers} keyField={(r) => r.id} loading={loading} emptyLabel="No passengers found" />
      </div>
    </div>
  );
}
