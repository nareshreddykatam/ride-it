"use client";

import * as React from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listDriversAdmin, type AdminDriverListRow } from "@ride-it/data";
import { DataTable, type Column } from "../../../components/data-table";

const STATUS_TONE = {
  pending: "pending",
  in_review: "pending",
  approved: "online",
  rejected: "alert",
  suspended: "alert",
} as const;

const STATUS_FILTERS: { value: AdminDriverListRow["verification_status"] | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
];

const columns: Column<AdminDriverListRow>[] = [
  {
    key: "name",
    header: "Driver",
    render: (row) => (
      <Link href={`/drivers/${row.id}`} className="font-medium text-ink hover:text-signal-blue">
        {row.full_name ?? "Unnamed driver"}
      </Link>
    ),
  },
  { key: "phone", header: "Phone", render: (row) => (row.phone ? `+91 ${row.phone}` : "—") },
  { key: "vehicleType", header: "Vehicle", render: (row) => (row.vehicle_type === "auto" ? "Auto" : "Bike") },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusPill tone={STATUS_TONE[row.verification_status]}>{row.verification_status.replace("_", " ")}</StatusPill>,
  },
  {
    key: "online",
    header: "Online",
    render: (row) => <StatusPill tone={row.is_online ? "online" : "offline"}>{row.is_online ? "Online" : "Offline"}</StatusPill>,
  },
  {
    key: "rating",
    header: "Rating",
    render: (row) =>
      row.rating > 0 ? (
        <span className="flex items-center gap-1">
          <Star size={13} className="fill-marigold text-marigold" aria-hidden="true" />
          {row.rating.toFixed(1)}
        </span>
      ) : (
        "—"
      ),
  },
];

export default function DriversPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [drivers, setDrivers] = React.useState<AdminDriverListRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<AdminDriverListRow["verification_status"] | "all">("all");

  React.useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(null);
    listDriversAdmin(supabase, { search: search || undefined, status: status === "all" ? undefined : status })
      .then(setDrivers)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load drivers."))
      .finally(() => setLoading(false));
  }, [supabase, user, search, status]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">Drivers</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Review documents, approve or reject registrations, and manage suspensions.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or phone"
          className="h-9 w-56 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-signal-blue"
        />
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                status === f.value ? "bg-signal-blue text-white" : "bg-ink/5 text-ink-soft"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-alert-red">{error}</p>}

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={drivers}
          keyField={(r) => r.id}
          loading={loading}
          emptyLabel="No drivers found"
          ariaLabel="Drivers table"
        />
      </div>
    </div>
  );
}
