"use client";

import * as React from "react";
import { Button, Card, CardHeader, CardTitle, MeterValue, StatusPill } from "@ride-it/ui";
import { DataTable, type Column } from "../../../components/data-table";

const PLANS = [
  { plan: "DAILY", amount: 49, activeSubscribers: 1204 },
  { plan: "WEEKLY", amount: 299, activeSubscribers: 2310 },
  { plan: "MONTHLY", amount: 999, activeSubscribers: 2280 },
  { plan: "YEARLY", amount: 9999, activeSubscribers: 316 },
];

interface PaymentRow {
  id: string;
  driver: string;
  plan: string;
  amount: string;
  date: string;
  status: "PAID" | "FAILED" | "REFUNDED";
}

const PAYMENTS: PaymentRow[] = [
  { id: "pay1", driver: "Ramesh K.", plan: "Monthly", amount: "₹999", date: "1 Aug 2026", status: "PAID" },
  { id: "pay2", driver: "Suresh P.", plan: "Weekly", amount: "₹299", date: "30 Jul 2026", status: "PAID" },
  { id: "pay3", driver: "Anita R.", plan: "Daily", amount: "₹49", date: "29 Jul 2026", status: "FAILED" },
];

const columns: Column<PaymentRow>[] = [
  { key: "driver", header: "Driver", render: (r) => r.driver },
  { key: "plan", header: "Plan", render: (r) => r.plan },
  { key: "amount", header: "Amount", render: (r) => <span className="font-meter">{r.amount}</span> },
  { key: "date", header: "Date", render: (r) => r.date },
  {
    key: "status",
    header: "Status",
    render: (r) => (
      <StatusPill tone={r.status === "PAID" ? "online" : r.status === "FAILED" ? "alert" : "pending"}>
        {r.status}
      </StatusPill>
    ),
  },
];

export default function SubscriptionsPage() {
  const [editing, setEditing] = React.useState<string | null>(null);

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-ink">Subscriptions</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Configure plan pricing and review subscription payments. This is
        Ride It&apos;s only source of platform revenue.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {PLANS.map((p) => (
          <Card key={p.plan}>
            <p className="text-xs text-ink-soft">{p.plan.charAt(0) + p.plan.slice(1).toLowerCase()}</p>
            <div className="mt-1 flex items-center justify-between">
              <MeterValue value={`₹${p.amount}`} size="md" />
              {editing === p.plan ? (
                <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                  Save
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setEditing(p.plan)}>
                  Edit
                </Button>
              )}
            </div>
            <p className="mt-2 text-xs text-ink-soft">{p.activeSubscribers.toLocaleString("en-IN")} active subscribers</p>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Payment reports</CardTitle>
        </CardHeader>
        <DataTable columns={columns} rows={PAYMENTS} keyField={(r) => r.id} />
      </Card>
    </div>
  );
}
