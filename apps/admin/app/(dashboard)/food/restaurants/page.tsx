"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Select, StatusPill } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getRestaurantApplications } from "@ride-it/data";
import { RestaurantStatus } from "@ride-it/types";
import { DataTable, type Column } from "../../../../components/data-table";

interface Row {
  id: string;
  name: string;
  status: string;
  address: string;
  phone: string;
  created_at: string;
  restaurant_owners: { users: { full_name: string | null; phone: string | null } } | null;
}

const STATUS_TONE: Record<string, "online" | "pending" | "alert" | "info" | "offline"> = {
  pending_verification: "pending",
  in_review: "info",
  approved: "online",
  rejected: "alert",
  suspended: "offline",
};

export default function AdminRestaurantsPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [filter, setFilter] = React.useState<string>("");

  const refresh = React.useCallback(() => {
    setRows(null);
    getRestaurantApplications(supabase, filter ? (filter.toUpperCase() as RestaurantStatus) : undefined).then((data) =>
      setRows(data as unknown as Row[])
    );
  }, [supabase, filter]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Restaurant",
      render: (r) => (
        <button onClick={() => router.push(`/food/restaurants/${r.id}`)} className="font-medium text-signal-blue hover:underline">
          {r.name}
        </button>
      ),
    },
    { key: "owner", header: "Owner", render: (r) => r.restaurant_owners?.users.full_name ?? r.restaurant_owners?.users.phone ?? "—" },
    { key: "address", header: "Address", render: (r) => <span className="text-ink-soft">{r.address}</span> },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? "info"}>{r.status.replace(/_/g, " ")}</StatusPill>,
    },
    { key: "created_at", header: "Applied", render: (r) => new Date(r.created_at).toLocaleDateString() },
  ];

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Restaurant Applications</h1>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} size="sm" className="w-56">
          <option value="">All statuses</option>
          <option value="pending_verification">Pending verification</option>
          <option value="in_review">In review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </Select>
      </div>

      <div className="mt-6">
        <DataTable
          columns={columns}
          rows={rows ?? []}
          keyField={(r) => r.id}
          loading={rows === null}
          ariaLabel="Restaurant applications"
        />
      </div>
    </main>
  );
}
