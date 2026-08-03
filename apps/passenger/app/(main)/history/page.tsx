import { Card, StatusPill } from "@ride-it/ui";

const RIDES = [
  { id: "r1", date: "2 Aug 2026", route: "Banjara Hills → Hitech City", fare: "₹88", vehicle: "Auto", status: "COMPLETED" },
  { id: "r2", date: "29 Jul 2026", route: "Airport → Secunderabad", fare: "₹312", vehicle: "Auto", status: "COMPLETED" },
  { id: "r3", date: "24 Jul 2026", route: "Charminar → Banjara Hills", fare: "₹0", vehicle: "Bike", status: "CANCELLED" },
];

export default function HistoryPage() {
  return (
    <main className="flex-1 px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Ride history</h1>

      <div className="mt-4 flex flex-col gap-3">
        {RIDES.map((ride) => (
          <Card key={ride.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-ink">{ride.route}</p>
                <p className="text-xs text-ink-soft">{ride.date} · {ride.vehicle}</p>
              </div>
              <div className="text-right">
                <p className="font-meter text-sm text-ink">{ride.fare}</p>
                <StatusPill tone={ride.status === "COMPLETED" ? "online" : "alert"} dot={false} className="mt-1">
                  {ride.status}
                </StatusPill>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
