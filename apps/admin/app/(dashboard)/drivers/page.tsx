"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { Button, DriverIcon, Input, StatusPill, VEHICLE_VISUALS } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listDriversAdmin, errorMessage, type AdminDriverListRow } from "@ride-it/data";
import { DataTable, type Column } from "../../../components/data-table";

const STATUS_TONE = {
  pending: "pending",
  in_review: "pending",
  approved: "verified",
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

const PAGE_SIZE = 25;

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
  {
    key: "vehicleType",
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
  const [hasMore, setHasMore] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<AdminDriverListRow["verification_status"] | "all">("all");

  // Any filter change invalidates the current page — jump back to the start
  // rather than showing page 3 of a now-different, possibly shorter result set.
  React.useEffect(() => {
    setPage(0);
  }, [search, status]);

  React.useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(null);
    listDriversAdmin(supabase, {
      search: search || undefined,
      status: status === "all" ? undefined : status,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then(({ rows, hasMore: more }) => {
        setDrivers(rows);
        setHasMore(more);
      })
      .catch((e) => setError(errorMessage(e) ?? "Couldn't load drivers."))
      .finally(() => setLoading(false));
  }, [supabase, user, search, status, page]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tint-blue text-signal-blue">
            <DriverIcon size={20} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-medium text-ink">Drivers</h1>
            <p className="text-sm text-ink-soft">
              Review documents, approve or reject registrations, and manage suspensions.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Input
          size="sm"
          className="w-56"
          aria-label="Search drivers by name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or phone"
        />
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by verification status">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={status === f.value}
              onClick={() => setStatus(f.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
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

      {!loading && (drivers.length > 0 || page > 0) && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-ink-soft">
            {drivers.length === 0 ? "No results on this page" : `Page ${page + 1}`}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft size={14} className="mr-1" /> Previous
            </Button>
            <Button size="sm" variant="outline" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight size={14} className="ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
