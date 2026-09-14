"use client";

import * as React from "react";
import { Button, Card, Input, StatusPill, Switch, Dialog } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getRestaurantSubscriptionPlans,
  createRestaurantSubscriptionPlan,
  updateRestaurantSubscriptionPlan,
  getAllRestaurantSubscriptions,
} from "@ride-it/data";
import { DataTable, type Column } from "../../../../components/data-table";

export default function AdminFoodSubscriptionsPage() {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [plans, setPlans] = React.useState<any[]>([]);
  const [subscriptions, setSubscriptions] = React.useState<any[] | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [durationDays, setDurationDays] = React.useState("30");
  const [saving, setSaving] = React.useState(false);

  const refresh = React.useCallback(() => {
    getRestaurantSubscriptionPlans(supabase).then(setPlans);
    getAllRestaurantSubscriptions(supabase).then((data) => setSubscriptions(data as any[]));
  }, [supabase]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreatePlan() {
    if (!name.trim() || !(Number(amount) >= 0) || !(Number(durationDays) > 0)) return;
    setSaving(true);
    try {
      await createRestaurantSubscriptionPlan(supabase, { name, amount: Number(amount), durationDays: Number(durationDays) });
      setPlanDialogOpen(false);
      setName("");
      setAmount("");
      setDurationDays("30");
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(planId: string, isActive: boolean) {
    await updateRestaurantSubscriptionPlan(supabase, planId, { isActive });
    refresh();
  }

  const subscriptionColumns: Column<any>[] = [
    { key: "restaurant", header: "Restaurant", render: (s) => s.restaurants?.name ?? "—" },
    { key: "plan", header: "Plan", render: (s) => s.restaurant_subscription_plans?.name ?? "—" },
    { key: "amount", header: "Amount", render: (s) => `₹${s.amount}` },
    { key: "status", header: "Status", render: (s) => <StatusPill tone={s.status === "active" ? "online" : "offline"}>{s.status}</StatusPill> },
    { key: "expires_at", header: "Expires", render: (s) => new Date(s.expires_at).toLocaleDateString() },
  ];

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Food Subscriptions</h1>
        <Button onClick={() => setPlanDialogOpen(true)}>Add plan</Button>
      </div>

      <p className="mt-6 text-xs font-bold uppercase tracking-wide text-ink-soft">Plans</p>
      <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <div className="flex items-center justify-between">
              <p className="font-display text-sm font-bold text-ink">{plan.name}</p>
              <Switch checked={plan.is_active} onCheckedChange={(checked) => handleToggleActive(plan.id, checked)} />
            </div>
            <p className="mt-1 font-meter text-xl font-bold text-signal-blue">₹{plan.amount}</p>
            <p className="text-xs text-ink-soft">{plan.duration_days} days</p>
          </Card>
        ))}
      </div>

      <p className="mt-8 text-xs font-bold uppercase tracking-wide text-ink-soft">Restaurant subscriptions</p>
      <div className="mt-2">
        <DataTable columns={subscriptionColumns} rows={subscriptions ?? []} keyField={(s) => s.id} loading={subscriptions === null} />
      </div>

      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <h2 className="font-display text-base font-semibold text-ink">New subscription plan</h2>
        <div className="mt-4 flex flex-col gap-3">
          <Input label="Plan name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly" />
          <Input label="Amount (₹)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input label="Duration (days)" type="number" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>
            Cancel
          </Button>
          <Button loading={saving} onClick={handleCreatePlan}>
            Create plan
          </Button>
        </div>
      </Dialog>
    </main>
  );
}
