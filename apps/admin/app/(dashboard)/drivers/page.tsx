import Link from "next/link";
import { StatusPill } from "@ride-it/ui";
import { DataTable, type Column } from "../../../components/data-table";

interface DriverRow {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  rating: number;
}

// Placeholder — wire to an admin driversApi.list() once the endpoint exists.
const DRIVERS: DriverRow[] = [
  { id: "d1", name: "Ramesh K.", phone: "98765 43210", vehicleType: "Auto", status: "APPROVED", rating: 4.8 },
  { id: "d2", name: "Suresh P.", phone: "91234 56780", vehicleType: "Bike", status: "PENDING", rating: 0 },
  { id: "d3", name: "Anita R.", phone: "99887 66554", vehicleType: "Auto", status: "SUSPENDED", rating: 3.2 },
  { id: "d4", name: "Vikram S.", phone: "90011 22334", vehicleType: "Bike", status: "APPROVED", rating: 4.6 },
];

const STATUS_TONE = {
  PENDING: "pending",
  APPROVED: "online",
  REJECTED: "alert",
  SUSPENDED: "alert",
} as const;

const columns: Column<DriverRow>[] = [
  {
    key: "name",
    header: "Driver",
    render: (row) => (
      <Link href={`/drivers/${row.id}`} className="font-medium text-ink hover:text-signal-blue">
        {row.name}
      </Link>
    ),
  },
  { key: "phone", header: "Phone", render: (row) => row.phone },
  { key: "vehicleType", header: "Vehicle", render: (row) => row.vehicleType },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusPill tone={STATUS_TONE[row.status]}>{row.status}</StatusPill>,
  },
  {
    key: "rating",
    header: "Rating",
    render: (row) => (row.rating > 0 ? `★ ${row.rating}` : "—"),
  },
];

export default function DriversPage() {
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

      <div className="mt-6">
        <DataTable columns={columns} rows={DRIVERS} keyField={(r) => r.id} />
      </div>
    </div>
  );
}
