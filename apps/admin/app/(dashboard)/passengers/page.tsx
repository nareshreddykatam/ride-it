import Link from "next/link";
import { StatusPill } from "@ride-it/ui";
import { DataTable, type Column } from "../../../components/data-table";

interface PassengerRow {
  id: string;
  name: string;
  phone: string;
  totalRides: number;
  status: "ACTIVE" | "SUSPENDED";
  rating: number;
}

const PASSENGERS: PassengerRow[] = [
  { id: "p1", name: "Priya S.", phone: "98123 45670", totalRides: 142, status: "ACTIVE", rating: 4.9 },
  { id: "p2", name: "Arjun M.", phone: "97654 32109", totalRides: 8, status: "ACTIVE", rating: 4.5 },
  { id: "p3", name: "Kavya N.", phone: "96543 21098", totalRides: 61, status: "SUSPENDED", rating: 2.8 },
];

const columns: Column<PassengerRow>[] = [
  {
    key: "name",
    header: "Passenger",
    render: (row) => (
      <Link href={`/passengers/${row.id}`} className="font-medium text-ink hover:text-signal-blue">
        {row.name}
      </Link>
    ),
  },
  { key: "phone", header: "Phone", render: (row) => row.phone },
  { key: "totalRides", header: "Total rides", render: (row) => row.totalRides },
  { key: "rating", header: "Rating", render: (row) => `★ ${row.rating}` },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <StatusPill tone={row.status === "ACTIVE" ? "online" : "alert"}>{row.status}</StatusPill>
    ),
  },
];

export default function PassengersPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-ink">Passengers</h1>
      <p className="mt-1 text-sm text-ink-soft">
        View ride history, handle complaints, and manage account suspensions.
      </p>
      <div className="mt-6">
        <DataTable columns={columns} rows={PASSENGERS} keyField={(r) => r.id} />
      </div>
    </div>
  );
}
