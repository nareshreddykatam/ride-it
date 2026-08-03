import { Card, CardHeader, CardTitle, MeterValue, StatusPill } from "@ride-it/ui";

// Placeholder data — wire to @ride-it/api-client once the analytics endpoints exist.
const STATS = [
  { label: "Drivers online", value: "1,284" },
  { label: "Rides today", value: "9,742" },
  { label: "Active subscriptions", value: "6,110" },
  { label: "Open complaints", value: "23" },
];

export default function OverviewPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-ink">Overview</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Platform snapshot across drivers, rides, subscriptions, and complaints.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STATS.map((stat) => (
          <Card key={stat.label}>
            <p className="text-xs text-ink-soft">{stat.label}</p>
            <p className="mt-1 font-meter text-2xl font-medium text-ink">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
            <StatusPill tone="info">This month</StatusPill>
          </CardHeader>
          {/* Per decision: subscription revenue (collected) shown separately
              from ride fare volume (analytics-only, not collected by Ride It) */}
          <div className="flex gap-8">
            <MeterValue value="₹18,42,600" label="Subscription revenue (collected)" />
            <MeterValue value="₹94,10,200" label="Ride fare volume (analytics only)" />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent complaints</CardTitle>
          </CardHeader>
          <p className="text-sm text-ink-soft">
            Complaint queue and ride-dispute detail view are next in this
            build phase — this page confirms dashboard layout, stat cards,
            and the revenue-split decision render correctly.
          </p>
        </Card>
      </div>
    </div>
  );
}
