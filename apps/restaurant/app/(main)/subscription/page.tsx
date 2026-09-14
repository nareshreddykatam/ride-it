"use client";

import * as React from "react";
import { Check, CreditCard } from "lucide-react";
import { Button, Card, PageLoader, StatusPill } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getRestaurantSubscriptionPlans,
  getCurrentRestaurantSubscription,
  createPendingRestaurantSubscriptionPayment,
  type RestaurantSubscriptionPlan,
} from "@ride-it/data";
import { openRazorpayCheckout } from "@ride-it/payments/client-checkout";
import { useRestaurant } from "../../../components/restaurant-context";

export default function SubscriptionPage() {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const { current, loading: loadingRestaurant } = useRestaurant();
  const [plans, setPlans] = React.useState<RestaurantSubscriptionPlan[] | null>(null);
  const [activeSub, setActiveSub] = React.useState<any>(null);
  const [purchasingId, setPurchasingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [paymentsConfigured, setPaymentsConfigured] = React.useState<boolean | null>(null);

  const refresh = React.useCallback(() => {
    if (!current) return;
    getCurrentRestaurantSubscription(supabase, current.id).then(setActiveSub);
  }, [supabase, current]);

  React.useEffect(() => {
    getRestaurantSubscriptionPlans(supabase).then(setPlans);
  }, [supabase]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    fetch("/api/system-health")
      .then((res) => (res.ok ? res.json() : { payments: false }))
      .then((data) => setPaymentsConfigured(!!data.payments))
      .catch(() => setPaymentsConfigured(false));
  }, []);

  async function handlePurchase(plan: RestaurantSubscriptionPlan) {
    if (!current) return;
    setError(null);
    setPurchasingId(plan.id);
    try {
      const payment = await createPendingRestaurantSubscriptionPayment(supabase, current.id, plan.id);
      const res = await fetch("/api/payments/subscription/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Couldn't start payment");

      await openRazorpayCheckout({
        keyId: payload.keyId,
        orderId: payload.orderId,
        amountInSmallestUnit: Math.round(payload.amount * 100),
        currency: payload.currency,
        name: "Ridora Food",
        description: `${plan.name} restaurant subscription`,
        onSuccess: async (result) => {
          await fetch("/api/payments/subscription/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paymentId: payload.paymentId,
              providerOrderId: result.razorpay_order_id,
              providerPaymentId: result.razorpay_payment_id,
              signature: result.razorpay_signature,
            }),
          });
          refresh();
          setPurchasingId(null);
        },
        onDismiss: () => setPurchasingId(null),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start payment");
      setPurchasingId(null);
    }
  }

  if (loadingRestaurant || plans === null) return <PageLoader />;

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-bold text-ink">Subscription</h1>

      {activeSub && (
        <Card className="mt-4" accent="green">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Active plan: {activeSub.restaurant_subscription_plans?.name}</p>
              <p className="mt-1 text-xs text-ink-soft">Expires {new Date(activeSub.expires_at).toLocaleDateString()}</p>
            </div>
            <StatusPill tone="verified">Active</StatusPill>
          </div>
        </Card>
      )}

      {paymentsConfigured === false && (
        <Card className="mt-4" accent="marigold">
          <p className="text-sm font-semibold text-ink">Online subscription payments are not available yet</p>
          <p className="mt-1 text-xs text-ink-soft">
            This environment doesn't have online payment credentials configured. Subscribing is temporarily disabled —
            contact Ridora support if you need a plan activated in the meantime.
          </p>
        </Card>
      )}

      {error && <p className="mt-4 text-sm font-medium text-alert-red-text">{error}</p>}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <p className="font-display text-base font-bold text-ink">{plan.name}</p>
            <p className="mt-1 font-meter text-2xl font-bold text-signal-blue">₹{plan.amount}</p>
            <p className="text-xs text-ink-soft">for {plan.durationDays} days</p>
            {plan.description && <p className="mt-2 text-sm text-ink-soft">{plan.description}</p>}
            {plan.features.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 text-xs text-ink-soft">
                    <Check size={13} className="text-meter-green" /> {f}
                  </li>
                ))}
              </ul>
            )}
            <Button
              className="mt-4 w-full"
              loading={purchasingId === plan.id}
              disabled={paymentsConfigured === false}
              onClick={() => handlePurchase(plan)}
            >
              <CreditCard size={15} /> {paymentsConfigured === false ? "Unavailable" : "Subscribe"}
            </Button>
          </Card>
        ))}
      </div>
    </main>
  );
}
