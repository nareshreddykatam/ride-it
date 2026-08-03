"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button, Card, MeterValue, StatusPill } from "@ride-it/ui";

// Placeholder pricing — wire to subscriptionsApi.getPlans() once the
// Admin-configured plan pricing endpoint exists.
const PLANS = [
  { plan: "DAILY", label: "Daily", amount: 49, perLabel: "per day" },
  { plan: "WEEKLY", label: "Weekly", amount: 299, perLabel: "per week", tag: "Save 12%" },
  { plan: "MONTHLY", label: "Monthly", amount: 999, perLabel: "per month", tag: "Most popular" },
  { plan: "YEARLY", label: "Yearly", amount: 9999, perLabel: "per year", tag: "Save 17%" },
] as const;

export default function SubscriptionPage() {
  const router = useRouter();
  const [selected, setSelected] = React.useState<(typeof PLANS)[number]["plan"]>("MONTHLY");
  const [purchasing, setPurchasing] = React.useState(false);

  async function handlePurchase() {
    setPurchasing(true);
    // TODO: wire to subscriptionsApi.purchase(selected) -> Razorpay checkout
    await new Promise((r) => setTimeout(r, 600));
    router.push("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="font-display text-2xl font-medium text-ink">Choose your plan</h1>
        <p className="mt-1 text-sm text-ink-soft">
          No commission, ever. Pick a subscription and keep 100% of every fare.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {PLANS.map((p) => {
            const active = selected === p.plan;
            return (
              <button key={p.plan} onClick={() => setSelected(p.plan)} className="text-left">
                <Card
                  className={
                    active
                      ? "border-2 border-signal-blue"
                      : "border border-border"
                  }
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-display text-base font-medium text-ink">{p.label}</p>
                        {"tag" in p && p.tag && <StatusPill tone="pending">{p.tag}</StatusPill>}
                      </div>
                      <p className="text-xs text-ink-soft">{p.perLabel}</p>
                    </div>
                    <MeterValue value={`₹${p.amount}`} size="md" />
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      </motion.div>

      <div className="mt-auto pt-8">
        <Button className="w-full" disabled={purchasing} onClick={handlePurchase}>
          {purchasing ? "Processing payment…" : "Subscribe & continue"}
        </Button>
        <p className="mt-3 text-center text-xs text-ink-soft">
          You can go online as soon as your subscription is active.
        </p>
      </div>
    </main>
  );
}
