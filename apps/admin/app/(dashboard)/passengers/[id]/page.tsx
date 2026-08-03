import { Card, CardHeader, CardTitle, StatusPill } from "@ride-it/ui";
import { Button } from "@ride-it/ui";

const RIDE_HISTORY = [
  { id: "r1", date: "2 Aug 2026", route: "Banjara Hills → Hitech City", fare: "₹88", status: "COMPLETED" },
  { id: "r2", date: "29 Jul 2026", route: "Airport → Secunderabad", fare: "₹312", status: "COMPLETED" },
  { id: "r3", date: "24 Jul 2026", route: "Charminar → Banjara Hills", fare: "₹0", status: "CANCELLED" },
];

export default function PassengerDetailPage({ params }: { params: { id: string } }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">Priya S.</h1>
          <p className="mt-1 text-sm text-ink-soft">Passenger ID: {params.id} · 98123 45670</p>
        </div>
        <StatusPill tone="online">Active</StatusPill>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Ride history</CardTitle>
        </CardHeader>
        <div className="flex flex-col divide-y divide-border">
          {RIDE_HISTORY.map((ride) => (
            <div key={ride.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <p className="text-ink">{ride.route}</p>
                <p className="text-xs text-ink-soft">{ride.date}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-meter text-ink">{ride.fare}</span>
                <StatusPill tone={ride.status === "COMPLETED" ? "online" : "alert"} dot={false}>
                  {ride.status}
                </StatusPill>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Complaints</CardTitle>
        </CardHeader>
        <p className="text-sm text-ink-soft">No open complaints for this passenger.</p>
      </Card>

      <div className="mt-6">
        <Button variant="destructive">Suspend passenger</Button>
      </div>
    </div>
  );
}
