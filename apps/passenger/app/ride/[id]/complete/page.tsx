"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Banknote, CreditCard, Smartphone } from "lucide-react";
import { Button, Card, MeterValue, Skeleton, StatusPill, cn } from "@ride-it/ui";
import { PaymentMethod } from "@ride-it/types";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getRide, setRidePaymentMethod, confirmDirectPayment, type RideRow } from "@ride-it/data";
import { createPendingRidePayment, attachRidePaymentOrder, getRidePayment, subscribeToPayment, type PaymentRow } from "@ride-it/data";
import { openRazorpayCheckout } from "@ride-it/payments/client-checkout";

const METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: PaymentMethod.CASH, label: "Cash", icon: Banknote },
  { value: PaymentMethod.DRIVER_UPI, label: "Driver UPI", icon: Smartphone },
  { value: PaymentMethod.ONLINE, label: "Ride It Online", icon: CreditCard },
];

type OnlineState = "idle" | "creating" | "awaiting_checkout" | "verifying" | "captured" | "failed" | "unavailable";

export default function RideCompletePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [ride, setRide] = React.useState<RideRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [method, setMethod] = React.useState<PaymentMethod>(PaymentMethod.CASH);
  const [confirming, setConfirming] = React.useState(false);
  const [onlineState, setOnlineState] = React.useState<OnlineState>("idle");
  const [onlineError, setOnlineError] = React.useState<string | null>(null);
  const [payment, setPayment] = React.useState<PaymentRow | null>(null);

  React.useEffect(() => {
    let active = true;
    getRide(supabase, params.id)
      .then((r) => active && setRide(r))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [supabase, params.id]);

  // Reacts live if a webhook resolves the payment after the checkout
  // widget's own callback already fired (or if the browser was closed
  // mid-flow and the passenger reopens this screen).
  React.useEffect(() => {
    if (!payment) return;
    if (payment.status === "captured") {
      const t = setTimeout(() => router.push(`/ride/${params.id}/rate`), 1200);
      return () => clearTimeout(t);
    }
    return subscribeToPayment(supabase, payment.id, (updated) => {
      setPayment(updated);
      if (updated.status === "captured") setOnlineState("captured");
      else if (updated.status === "failed") setOnlineState("failed");
    });
  }, [supabase, payment, router, params.id]);

  async function handleCashOrUpiConfirm(selected: PaymentMethod) {
    setConfirming(true);
    try {
      // Phase 16 fix: confirmDirectPayment() is the actual path that
      // marks payment_status='paid' — complete_ride()'s own cash/
      // driver_upi auto-confirm branch (Phase 11) checks payment_method
      // at ride-completion time, but this screen (where the method is
      // actually chosen) only appears AFTER the ride has already
      // completed, so that branch was never reachable in practice. See
      // PHASE_16_END_TO_END_INTEGRATION_REVIEW.md.
      await confirmDirectPayment(supabase, params.id, selected === PaymentMethod.CASH ? "cash" : "driver_upi");
      router.push(`/ride/${params.id}/rate`);
    } catch {
      setConfirming(false);
    }
  }

  async function handlePayOnline() {
    if (!ride || !user) return;
    setOnlineError(null);
    setOnlineState("creating");
    try {
      await setRidePaymentMethod(supabase, params.id, { paymentMethod: "online" });

      const createRes = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rideId: params.id }),
      });
      const createData = await createRes.json();

      if (!createRes.ok) {
        // Includes the "gateway not configured" 503 — shown honestly,
        // not disguised as a generic error.
        setOnlineState("unavailable");
        setOnlineError(createData.error ?? "Ride It Online payment isn't available right now.");
        return;
      }

      const currentPayment = await getRidePayment(supabase, params.id);
      setPayment(currentPayment);
      setOnlineState("awaiting_checkout");

      await openRazorpayCheckout({
        keyId: createData.keyId,
        orderId: createData.orderId,
        amountInSmallestUnit: Math.round(createData.amount * 100),
        currency: createData.currency,
        name: "Ride It",
        description: `Ride payment — ${params.id.slice(0, 8)}`,
        onSuccess: async (result) => {
          setOnlineState("verifying");
          try {
            const verifyRes = await fetch("/api/payments/verify", {
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
            // Server-verified state only — never inferred from the
            // checkout widget's own callback firing.
            if (verifyData.status === "captured") {
              setOnlineState("captured");
            } else if (verifyData.status === "verification_pending") {
              setOnlineState("verifying"); // realtime subscription above will resolve this once the webhook lands
            } else {
              setOnlineState("failed");
            }
          } catch {
            setOnlineState("verifying"); // webhook will still reconcile even if this network call failed
          }
        },
        onDismiss: () => {
          if (onlineState === "awaiting_checkout") setOnlineState("idle");
        },
      });
    } catch (e) {
      setOnlineState("failed");
      setOnlineError(e instanceof Error ? e.message : "Couldn't start payment.");
    }
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="font-display text-2xl font-medium text-ink">Ride completed</h1>
        <p className="mt-1 text-sm text-ink-soft">Here&apos;s your fare breakdown.</p>

        <Card className="mt-6">
          {loading || !ride ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-12" />
              </div>
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-12" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm text-ink-soft">
                <span>Base fare</span>
                <span className="font-meter text-ink">₹{ride.base_fare}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-ink-soft">
                <span>Distance fare</span>
                <span className="font-meter text-ink">₹{ride.distance_fare}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm font-medium text-ink">Total</span>
                <MeterValue value={`₹${ride.total_fare}`} size="md" />
              </div>
            </>
          )}
        </Card>

        <p className="mt-6 text-sm font-medium text-ink">Pay with</p>
        <div className="mt-2 flex gap-2">
          {METHODS.map(({ value, label, icon: Icon }) => {
            const active = method === value;
            return (
              <button
                key={value}
                onClick={() => {
                  setMethod(value);
                  setOnlineState("idle");
                  setOnlineError(null);
                }}
                className="flex-1"
              >
                <div
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border bg-white py-4",
                    active ? "border-2 border-signal-blue" : "border-border"
                  )}
                >
                  <Icon size={20} className={active ? "text-signal-blue" : "text-ink-soft"} />
                  <span className="text-xs text-ink">{label}</span>
                </div>
              </button>
            );
          })}
        </div>

        {method === PaymentMethod.ONLINE && (
          <div className="mt-4">
            {onlineState === "unavailable" && (
              <Card className="border-marigold bg-marigold/5">
                <p className="text-sm text-ink">Ride It Online payment isn&apos;t available right now.</p>
                <p className="mt-1 text-xs text-ink-soft">{onlineError ?? "Please choose Cash or Driver UPI instead."}</p>
              </Card>
            )}
            {(onlineState === "verifying") && (
              <Card>
                <div className="flex items-center gap-2">
                  <StatusPill tone="pending">Verification pending</StatusPill>
                </div>
                <p className="mt-2 text-xs text-ink-soft">
                  We&apos;re confirming your payment with the bank. This page will update automatically — no need to pay again.
                </p>
              </Card>
            )}
            {onlineState === "captured" && (
              <Card className="border-meter-green bg-meter-green/5">
                <StatusPill tone="online">Payment successful</StatusPill>
                <p className="mt-2 text-xs text-ink-soft">Redirecting…</p>
              </Card>
            )}
            {onlineState === "failed" && (
              <Card className="border-alert-red bg-alert-red/5">
                <StatusPill tone="alert">Payment failed</StatusPill>
                <p className="mt-2 text-xs text-ink-soft">{onlineError ?? "You can try again."}</p>
              </Card>
            )}
          </div>
        )}
      </motion.div>

      <div className="mt-auto pt-8">
        {method === PaymentMethod.ONLINE ? (
          <Button
            className="w-full"
            disabled={["creating", "awaiting_checkout", "verifying", "captured"].includes(onlineState)}
            onClick={handlePayOnline}
          >
            {onlineState === "creating"
              ? "Starting payment…"
              : onlineState === "awaiting_checkout"
                ? "Waiting for checkout…"
                : onlineState === "verifying"
                  ? "Verifying…"
                  : onlineState === "captured"
                    ? "Paid"
                    : onlineState === "failed"
                      ? "Try again"
                      : "Pay online"}
          </Button>
        ) : (
          <Button className="w-full" disabled={confirming} onClick={() => handleCashOrUpiConfirm(method)}>
            {confirming ? "Confirming…" : method === PaymentMethod.CASH ? "Confirm cash payment" : "Confirm Driver UPI payment"}
          </Button>
        )}
      </div>
    </main>
  );
}
