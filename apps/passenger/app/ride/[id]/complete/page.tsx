"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, CreditCard } from "lucide-react";
import { Button, Card, MeterValue, Skeleton, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getRide, passengerSelectOnlinePaymentMethod, getMatchedDriverUpi, type RideRow } from "@ride-it/data";
import { createPendingRidePayment, attachRidePaymentOrder, getRidePayment, subscribeToPayment, type PaymentRow } from "@ride-it/data";
import { openRazorpayCheckout } from "@ride-it/payments/client-checkout";
import { buildUpiPaymentUri, generateUpiQrDataUrl } from "@ride-it/payments/upi";

type OnlineState = "idle" | "creating" | "awaiting_checkout" | "verifying" | "captured" | "failed" | "unavailable";

export default function RideCompletePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [ride, setRide] = React.useState<RideRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [onlineState, setOnlineState] = React.useState<OnlineState>("idle");
  const [onlineError, setOnlineError] = React.useState<string | null>(null);
  const [payment, setPayment] = React.useState<PaymentRow | null>(null);
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [qrLoading, setQrLoading] = React.useState(false);
  const [driverUpi, setDriverUpi] = React.useState<{ upiId: string | null; driverName: string | null; acceptsDriverUpi: boolean } | null>(null);

  React.useEffect(() => {
    let active = true;
    getRide(supabase, params.id)
      .then((r) => {
        if (!active) return;
        setRide(r);
      })
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

  // Driver UPI QR — legacy/edge-case fallback only. Normally the driver
  // already confirmed a driver_upi payment (driver_confirm_payment_received)
  // before the ride ever reached completion, so payment_status is already
  // 'paid' by the time this screen loads and this effect never fires. Kept
  // so a ride that somehow completed with payment_method='driver_upi'
  // still pending (e.g. one already in flight when this flow shipped)
  // still shows a working QR instead of nothing. Generated client-side
  // from the matched driver's registered UPI id (get_matched_driver_upi(),
  // scoped server-side to this passenger's own fare-final ride — never a
  // client-supplied driver id) and this ride's own already-authoritative
  // total_fare.
  React.useEffect(() => {
    if (!ride || ride.payment_method !== "driver_upi" || ride.payment_status === "paid") return;
    let active = true;
    setQrLoading(true);
    getMatchedDriverUpi(supabase, params.id)
      .then(async (info) => {
        if (!active) return;
        setDriverUpi(info);
        if (info.upiId && info.acceptsDriverUpi) {
          const uri = buildUpiPaymentUri({
            upiId: info.upiId,
            payeeName: info.driverName ?? "Your driver",
            amount: ride.total_fare,
            note: `Ridora ride ${params.id.slice(0, 8)}`,
          });
          const dataUrl = await generateUpiQrDataUrl(uri);
          if (active) setQrDataUrl(dataUrl);
        } else {
          setQrDataUrl(null);
        }
      })
      .catch(() => {
        if (active) {
          setDriverUpi(null);
          setQrDataUrl(null);
        }
      })
      .finally(() => active && setQrLoading(false));
    return () => {
      active = false;
    };
  }, [params.id, ride, supabase]);

  async function handlePayOnline() {
    if (!ride || !user) return;
    setOnlineError(null);
    setOnlineState("creating");
    try {
      await passengerSelectOnlinePaymentMethod(supabase, params.id);

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
        setOnlineError(createData.error ?? "Ridora Online payment isn't available right now.");
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
        name: "Ridora",
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

  const alreadyPaid = ride?.payment_status === "paid";
  // True only for the rare legacy/edge case: a ride completed with a
  // driver-collected method chosen but never confirmed (e.g. one already
  // in flight when this driver-confirms flow shipped). In the normal
  // case the driver already confirmed payment before the ride could even
  // reach ride_completed, so alreadyPaid is already true by the time this
  // screen loads.
  const awaitingDriverConfirmation = !alreadyPaid && (ride?.payment_method === "cash" || ride?.payment_method === "driver_upi");

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-meter-green/10 text-meter-green"
        >
          <CheckCircle2 size={22} strokeWidth={1.8} />
        </motion.span>
        <h1 className="mt-3 font-display text-2xl font-semibold text-ink">Ride completed</h1>
        <p className="mt-1 text-sm text-ink-soft">Here&apos;s your final fare — calculated by Ridora from your ride&apos;s actual distance.</p>

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
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-soft">
                <span>Final fare</span>
                {ride.distance_km != null && <span className="tabular-nums">{Number(ride.distance_km).toFixed(2)} km</span>}
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-ink-soft">
                <span>Base fare</span>
                <span className="font-meter text-ink">₹{ride.base_fare}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-ink-soft">
                <span>Distance fare</span>
                <span className="font-meter text-ink">₹{ride.distance_fare}</span>
              </div>
              {ride.surge_multiplier > 1 && (
                <div className="mt-2 flex items-center justify-between text-sm text-ink-soft">
                  <span>Surge applied</span>
                  <span className="font-meter text-marigold-text">{ride.surge_multiplier}x</span>
                </div>
              )}
              {ride.discount_amount > 0 && (
                <div className="mt-2 flex items-center justify-between text-sm text-ink-soft">
                  <span>Discount</span>
                  <span className="font-meter text-meter-green-text">-₹{ride.discount_amount}</span>
                </div>
              )}
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <span className="text-sm font-medium text-ink">Total</span>
                <MeterValue value={`₹${ride.total_fare}`} size="lg" />
              </div>
            </>
          )}
        </Card>

        {/* Payment is informational here — the passenger never chooses or
            confirms how a cash/UPI payment was collected; the driver
            already did, server-side, before this ride could even reach
            ride_completed (see driver_select_payment_method /
            driver_confirm_payment_received). The one remaining passenger
            action is paying online themselves, when no driver-collected
            payment was ever recorded. */}
        {alreadyPaid && (
          <Card className="mt-4 border-meter-green bg-meter-green/5">
            <StatusPill tone="online">Payment collected</StatusPill>
            <p className="mt-2 text-xs text-ink-soft">
              Paid via {ride?.payment_method === "driver_upi" ? "Driver UPI" : ride?.payment_method === "online" ? "Ridora Online" : "Cash"}.
            </p>
          </Card>
        )}

        {awaitingDriverConfirmation && (
          <Card className="mt-4">
            <p className="text-sm text-ink">
              Your driver will confirm receiving your {ride?.payment_method === "driver_upi" ? "Driver UPI" : "cash"} payment.
            </p>
            {ride?.payment_method === "driver_upi" && (
              <div className="mt-3 text-center">
                {qrLoading ? (
                  <Skeleton className="mx-auto h-48 w-48" />
                ) : qrDataUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a client-generated data: URL, not a static asset */}
                    <img src={qrDataUrl} alt="Scan to pay your driver via UPI" className="mx-auto h-48 w-48 rounded-lg object-contain" />
                    <p className="mt-2 text-xs text-ink-soft">UPI ID: {driverUpi?.upiId}</p>
                  </>
                ) : (
                  <p className="text-xs text-ink-soft">Couldn&apos;t load payment details.</p>
                )}
              </div>
            )}
          </Card>
        )}

        {!alreadyPaid && !awaitingDriverConfirmation && (
          <>
            <p className="mt-6 text-sm font-medium text-ink">Pay online</p>
            <p className="mt-1 text-xs text-ink-soft">No driver-collected payment was recorded for this ride.</p>
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
              <CreditCard size={20} className="text-signal-blue" />
              <span className="text-sm text-ink">Ridora Online</span>
            </div>

            {onlineState === "unavailable" && (
              <Card className="mt-4 border-marigold bg-marigold/5">
                <p className="text-sm text-ink">Ridora Online payment isn&apos;t available right now.</p>
                <p className="mt-1 text-xs text-ink-soft">{onlineError ?? "Please contact support."}</p>
              </Card>
            )}
            {onlineState === "verifying" && (
              <Card className="mt-4">
                <div className="flex items-center gap-2">
                  <StatusPill tone="pending">Verification pending</StatusPill>
                </div>
                <p className="mt-2 text-xs text-ink-soft">
                  We&apos;re confirming your payment with the bank. This page will update automatically — no need to pay again.
                </p>
              </Card>
            )}
            {onlineState === "captured" && (
              <Card className="mt-4 border-meter-green bg-meter-green/5">
                <StatusPill tone="online">Payment successful</StatusPill>
                <p className="mt-2 text-xs text-ink-soft">Redirecting…</p>
              </Card>
            )}
            {onlineState === "failed" && (
              <Card className="mt-4 border-alert-red bg-alert-red/5">
                <StatusPill tone="alert">Payment failed</StatusPill>
                <p className="mt-2 text-xs text-ink-soft">{onlineError ?? "You can try again."}</p>
              </Card>
            )}
          </>
        )}
      </motion.div>

      {!alreadyPaid && !awaitingDriverConfirmation && (
        <div className="mt-auto pt-8">
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
        </div>
      )}

      {(alreadyPaid || awaitingDriverConfirmation) && (
        <div className="mt-auto pt-8">
          <Button className="w-full" onClick={() => router.push(`/ride/${params.id}/rate`)}>
            Continue
          </Button>
        </div>
      )}
    </main>
  );
}
