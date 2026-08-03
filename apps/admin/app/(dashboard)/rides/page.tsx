import Link from "next/link";
import { StatusPill } from "@ride-it/ui";
import { DataTable, type Column } from "../../../components/data-table";

interface RideRow {
  id: string;
  passenger: string;
  driver: string;
  vehicle: "Bike" | "Auto";
  status: "REQUESTED" | "ONGOING" | "COMPLETED" | "CANCELLED" | "DISPUTED";
  fare: string;
}

const RIDES: RideRow[] = [
  { id: "rd1", passenger: "Priya S.", driver: "Ramesh K.", vehicle: "Auto", status: "ONGOING", fare: "₹88" },
  { id: "rd2", passenger: "Arjun M.", driver: "Vikram S.", vehicle: "Bike", status: "COMPLETED", fare: "₹42" },
  { id: "rd3", passenger: "Kavya N.", driver: "Suresh P.", vehicle: "Bike", status: "DISPUTED", fare: "₹65" },
  { id: "rd4", passenger: "Rohit T.", driver: "—", vehicle: "Auto", status: "REQUESTED", fare: "—" },
];

const STATUS_TONE = {
  REQUESTED: "pending",
  ONGOING: "info",
  COMPLETED: "online",
  CANCELLED: "offline",
  DISPUTED: "alert",
} as const;

const columns: Column<RideRow>[] = [
  {
    key: "id",
    header: "Ride",
    render: (row) => (
      <Link href={`/rides/${row.id}`} className="font-medium text-ink hover:text-signal-blue">
        #{row.id}
      </Link>
    ),
  },
  { key: "passenger", header: "Passenger", render: (row) => row.passenger },
  { key: "driver", header: "Driver", render: (row) => row.driver },
  { key: "vehicle", header: "Vehicle", render: (row) => row.vehicle },
  { key: "fare", header: "Fare", render: (row) => <span className="font-meter">{row.fare}</span> },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusPill tone={STATUS_TONE[row.status]}>{row.status}</StatusPill>,
  },
];

export default function RidesPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-ink">Live Rides</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Monitor active rides, cancel or reassign, and investigate disputes.
      </p>
      <div className="mt-6">
        <DataTable columns={columns} rows={RIDES} keyField={(r) => r.id} />
      </div>
    </div>
  );
}
