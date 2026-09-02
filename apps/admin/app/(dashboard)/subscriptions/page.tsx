"use client";

import * as React from "react";
import { Button, Card, CardHeader, CardTitle, MeterValue, Skeleton, StatusPill, WalletIcon } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  listSubscriptionPlansAdmin,
  updateSubscriptionPlanAmount,
  listSubscriptionPaymentsAdmin,
  getActiveSubscriptionCountsByPlan,
  type SubscriptionPlanRow,
  type AdminSubscriptionPaymentRow,
} from "@ride-it/data";
import { DataTable, type Column } from "../../../components/data-table";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const columns: Column<AdminSubscriptionPaymentRow>[] = [
  { key: "driver", header: "Driver", render: (r) => r.driver_name ?? "—" },
  { key: "amount", header: "Amount", render: (r) => <span className="font-meter">₹{r.amount}</span> },
  { key: "date", header: "Date", render: (r) => formatDate(r.paid_at ?? r.created_at) },
  {
    key: "status",
    header: "Status",
    render: (r) => (
      <StatusPill tone={r.status === "paid" ? "online" : r.status === "failed" ? "alert" : "pending"}>{r.status}</StatusPill>
    ),
  },
];

export default function SubscriptionsPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [plans, setPlans] = React.useState<SubscriptionPlanRow[]>([]);
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [payments, setPayments] = React.useState<AdminSubscriptionPaymentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");

  const refresh = React.useCallback(async () => {
    const [p, c, pay] = await Promise.all([
      listSubscriptionPlansAdmin(supabase),
      getActiveSubscriptionCountsByPlan(supabase),
      listSubscriptionPaymentsAdmin(supabase),
    ]);
    setPlans(p);
    setCounts(Object.fromEntries(c.map((x) => [x.plan, x.activeCount])));
    setPayments(pay);
  }, [supabase]);

  React.useEffect(() => {
    if (!user) return;
    refresh().finally(() => setLoading(false));
  }, [user, refresh]);

  async function handleSave(plan: SubscriptionPlanRow["plan"]) {
    const amount = Number(editValue);
    if (!Number.isFinite(amount) || amount < 0) return;
    await updateSubscriptionPlanAmount(supabase, plan, amount);
    setEditing(null);
    await refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tint-marigold text-marigold-text">
          <WalletIcon size={20} />
        </span>
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">Subscriptions</h1>
          <p className="text-sm text-ink-soft">
            Configure plan pricing and review subscription payments. This is Ridora&apos;s only source of platform revenue.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          : plans.map((p) => (
              <Card key={p.plan} tone="elevated" accent="marigold">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{p.plan.charAt(0).toUpperCase() + p.plan.slice(1)}</p>
                <div className="mt-1 flex items-center justify-between">
                  {editing === p.plan ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-8 w-20 rounded border border-border px-2 font-meter text-sm"
                    />
                  ) : (
                    <MeterValue value={`₹${p.amount}`} size="md" />
                  )}
                  {editing === p.plan ? (
                    <Button size="sm" variant="outline" onClick={() => handleSave(p.plan)}>
                      Save
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(p.plan);
                        setEditValue(String(p.amount));
                      }}
                    >
                      Edit
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-xs text-ink-soft">{(counts[p.plan] ?? 0).toLocaleString("en-IN")} active subscribers</p>
              </Card>
            ))}
      </div>

      <Card className="mt-6" accent="blue">
        <CardHeader>
          <CardTitle>Payment reports</CardTitle>
        </CardHeader>
        <DataTable
          columns={columns}
          rows={payments}
          keyField={(r) => r.id}
          loading={loading}
          emptyLabel="No payments yet"
          ariaLabel="Subscription payments table"
        />
      </Card>
    </div>
  );
}
