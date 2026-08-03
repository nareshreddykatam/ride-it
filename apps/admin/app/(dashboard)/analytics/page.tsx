"use client";

import { Card, CardHeader, CardTitle } from "@ride-it/ui";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";

const RIDE_TRENDS = [
  { day: "Mon", rides: 8200 },
  { day: "Tue", rides: 8650 },
  { day: "Wed", rides: 9100 },
  { day: "Thu", rides: 8890 },
  { day: "Fri", rides: 9740 },
  { day: "Sat", rides: 11200 },
  { day: "Sun", rides: 10430 },
];

const SUBSCRIPTION_GROWTH = [
  { month: "Mar", subscribers: 3200 },
  { month: "Apr", subscribers: 4100 },
  { month: "May", subscribers: 4950 },
  { month: "Jun", subscribers: 5600 },
  { month: "Jul", subscribers: 6110 },
];

export default function AnalyticsPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-ink">Analytics</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Ride volume, subscriber growth, and platform health at a glance.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rides this week</CardTitle>
          </CardHeader>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={RIDE_TRENDS}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" stroke="var(--ink-soft)" fontSize={12} />
                <YAxis stroke="var(--ink-soft)" fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="rides" stroke="var(--signal-blue)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscriber growth</CardTitle>
          </CardHeader>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={SUBSCRIPTION_GROWTH}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--ink-soft)" fontSize={12} />
                <YAxis stroke="var(--ink-soft)" fontSize={12} />
                <Tooltip />
                <Bar dataKey="subscribers" fill="var(--marigold)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Average ratings</CardTitle>
          </CardHeader>
          <div className="flex gap-8">
            <div>
              <p className="font-meter text-3xl text-ink">4.7</p>
              <p className="text-xs text-ink-soft">Driver average</p>
            </div>
            <div>
              <p className="font-meter text-3xl text-ink">4.8</p>
              <p className="text-xs text-ink-soft">Passenger average</p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cancellation rate</CardTitle>
          </CardHeader>
          <p className="font-meter text-3xl text-ink">4.2%</p>
          <p className="text-xs text-ink-soft">Of all requested rides this week</p>
        </Card>
      </div>
    </div>
  );
}
