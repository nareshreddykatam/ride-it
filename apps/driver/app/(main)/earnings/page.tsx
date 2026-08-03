"use client";

import * as React from "react";
import { Card, MeterValue } from "@ride-it/ui";

const RANGES = ["Today", "This week", "This month"] as const;

const RIDES = [
  { id: "e1", time: "6:42 PM", route: "Banjara Hills → Hitech City", fare: 88 },
  { id: "e2", time: "5:10 PM", route: "Charminar → Secunderabad", fare: 142 },
  { id: "e3", time: "3:55 PM", route: "Airport → Gachibowli", fare: 310 },
  { id: "e4", time: "1:20 PM", route: "Kukatpally → Ameerpet", fare: 65 },
];

export default function EarningsPage() {
  const [range, setRange] = React.useState<(typeof RANGES)[number]>("Today");
  const total = RIDES.reduce((sum, r) => sum + r.fare, 0);

  return (
    <main className="flex-1 px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Earnings</h1>

      <div className="mt-4 flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              range === r ? "bg-signal-blue text-white" : "bg-ink/5 text-ink-soft"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <Card className="mt-4">
        <MeterValue value={`₹${total}`} label={`Total earned — ${range.toLowerCase()}`} size="lg" />
        <p className="mt-2 text-xs text-ink-soft">{RIDES.length} rides completed</p>
      </Card>

      <div className="mt-6 flex flex-col divide-y divide-border">
        {RIDES.map((ride) => (
          <div key={ride.id} className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm text-ink">{ride.route}</p>
              <p className="text-xs text-ink-soft">{ride.time}</p>
            </div>
            <span className="font-meter text-sm text-ink">₹{ride.fare}</span>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-ink-soft">
        Since drivers keep 100% of every fare, this is the driver&apos;s
        actual take-home — no commission is deducted anywhere in this view.
      </p>
    </main>
  );
}
