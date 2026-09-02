"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button, Card, MeterValue, Skeleton, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { createPendingSubscriptionPayment, attachSubscriptionPaymentOrder, type SubscriptionRow } from "@ride-it/data";
import { openRazorpayCheckout } from "@ride-it/payments/client-checkout";

// Pricing display mirrors subscription_plans (the real source of truth,
// Phase 6.1) — shown here for the picker UI only; the actual amount
// charged is always re-derived server-side by
// create_pending_subscription_payment(), never trusted from these
// constants.
const PLANS: { plan: SubscriptionRow["plan"]; label: string; amount: number; perLabel: string; tag?: string }[] = [
  { plan: "daily", label: "Daily", amount: 49, perLabel: "per day" },
  { plan: "weekly", label: "Weekly", amount: 299, perLabel: "per week", tag: "Save 12%" },
  { plan: "monthly", label: "Monthly", amount: 999, perLabel: "per month", tag: "Most popular" },
  { plan: "yearly", label: "Yearly", amount: 9999, perLabel: "per year", tag: "Save 17%" },
];

type PayState = "idle" | "creating" | "awaiting_checkout" | "verifying" | "captured" | "failed" | "unavailable";

export default function SubscriptionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [selected, setSelected] = React.useState<SubscriptionRow["plan"]>("monthly");
  const [payState, setPayState] = React.useState<PayState>("idle");
  const [error, setError] = React.useState<string | null>(null);

  async function handlePurchase() {
    if (!user) return;
    setError(null);
    setPayState("creating");
    try {
      const createRes = await fetch("/api/payments/subscription/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selected }),
      });
      const createData = await createRes.json();

      if (!createRes.ok) {
        setPayState("unavailable");
        setError(createData.error ?? "Online subscription payment isn't available right now.");
        return;
      }

      setPayState("awaiting_checkout");

      await openRazorpayCheckout({
        keyId: createData.keyId,
        orderId: createData.orderId,
        amountInSmallestUnit: Math.round(createData.amount * 100),
        currency: createData.currency,
        name: "Ridora",
        description: `${selected.charAt(0).toUpperCase() + selected.slice(1)} subscription`,
        onSuccess: async (result) => {
          setPayState("verifying");
          try {
            const verifyRes = await fetch("/api/payments/subscription/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                paymentId: createData.paymentId,
                providerOrderId: result.razorpay_order_id,
                providerPaymentId: result.razorpay_payment_id,
                signature: result.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (verifyData.status === "paid") {
              setPayState("captured");
              setTimeout(() => router.push("/dashboard"), 1200);
            } else {
              // "pending" (webhook still to arrive) or "failed" both land
              // here — neither is "captured", so neither is shown as
              // success. A driver can check back or retry.
              setPayState(verifyData.status === "failed" ? "failed" : "verifying");
            }
          } catch {
            setPayState("verifying");
          }
        },
        onDismiss: () => {
          setPayState((s) => (s === "awaiting_checkout" ? "idle" : s));
        },
      });
    } catch (e) {
      setPayState("failed");
      setError(e instanceof Error ? e.message : "Couldn't start payment.");
    }
  }

  const busy = ["creating", "awaiting_checkout", "verifying", "captured"].includes(payState);

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
              <button key={p.plan} onClick={() => setSelected(p.plan)} aria-pressed={active} className="text-left">
                <Card
                  tone={active ? "elevated" : "default"}
                  className={active ? "rounded-lg border-2 border-marigold" : "rounded-lg border border-border"}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-display text-base font-medium text-ink">{p.label}</p>
                        {p.tag && <StatusPill tone="pending">{p.tag}</StatusPill>}
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

        {payState === "unavailable" && (
          <Card accent="marigold" className="mt-4 bg-tint-marigold">
            <p className="text-sm text-ink">Online subscription payment isn&apos;t available right now.</p>
            <p className="mt-1 text-xs text-ink-soft">{error}</p>
          </Card>
        )}
        {payState === "verifying" && (
          <Card className="mt-4">
            <StatusPill tone="pending">Verification pending</StatusPill>
            <p className="mt-2 text-xs text-ink-soft">
              We&apos;re confirming your payment. Your subscription activates automatically once confirmed — no need to pay again.
            </p>
          </Card>
        )}
        {payState === "captured" && (
          <Card accent="green" className="mt-4 bg-meter-green/5">
            <StatusPill tone="verified">Payment successful</StatusPill>
            <p className="mt-2 text-xs text-ink-soft">Activating your subscription…</p>
          </Card>
        )}
        {payState === "failed" && error && <p className="mt-3 text-xs text-alert-red">{error}</p>}
      </motion.div>

      <div className="mt-auto pt-8">
        <Button variant="marigold" className="w-full" disabled={busy} onClick={handlePurchase}>
          {payState === "creating"
            ? "Starting payment…"
            : payState === "awaiting_checkout"
              ? "Waiting for checkout…"
              : payState === "verifying"
                ? "Verifying…"
                : payState === "captured"
                  ? "Activating…"
                  : "Subscribe & pay"}
        </Button>
        <p className="mt-3 text-center text-xs text-ink-soft">
          You can go online as soon as your subscription is confirmed active.
        </p>
      </div>
    </main>
  );
}
