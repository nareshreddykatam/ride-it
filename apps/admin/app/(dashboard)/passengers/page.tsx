"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { Button, Input, PassengerIcon, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listPassengersAdmin, type AdminPassengerListRow } from "@ride-it/data";
import { DataTable, type Column } from "../../../components/data-table";

const PAGE_SIZE = 25;

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
  const [hasMore, setHasMore] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    setPage(0);
  }, [search]);

  React.useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(null);
    listPassengersAdmin(supabase, { search: search || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then(({ rows, hasMore: more }) => {
        setPassengers(rows);
        setHasMore(more);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load passengers."))
      .finally(() => setLoading(false));
  }, [supabase, user, search, page]);

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tint-violet text-violet-text">
          <PassengerIcon size={20} />
        </span>
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">Passengers</h1>
          <p className="text-sm text-ink-soft">
            View ride history, handle complaints, and manage account suspensions.
          </p>
        </div>
      </div>

      <Input
        size="sm"
        className="mt-4 w-56"
        aria-label="Search passengers by name or phone"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name or phone"
      />

      {error && <p className="mt-3 text-sm text-alert-red">{error}</p>}

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={passengers}
          keyField={(r) => r.id}
          loading={loading}
          emptyLabel="No passengers found"
          ariaLabel="Passengers table"
        />
      </div>

      {!loading && (passengers.length > 0 || page > 0) && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-ink-soft">
            {passengers.length === 0 ? "No results on this page" : `Page ${page + 1}`}
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
