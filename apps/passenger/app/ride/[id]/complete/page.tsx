"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Banknote, CheckCircle2, CreditCard, Smartphone } from "lucide-react";
import { Button, Card, MeterValue, Skeleton, StatusPill, cn } from "@ride-it/ui";
import { PaymentMethod } from "@ride-it/types";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getRide, setRidePaymentMethod, confirmDirectPayment, getMatchedDriverUpi, type RideRow } from "@ride-it/data";
import { createPendingRidePayment, attachRidePaymentOrder, getRidePayment, subscribeToPayment, type PaymentRow } from "@ride-it/data";
import { openRazorpayCheckout } from "@ride-it/payments/client-checkout";
import { buildUpiPaymentUri, generateUpiQrDataUrl } from "@ride-it/payments/upi";

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
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [qrLoading, setQrLoading] = React.useState(false);
  const [driverUpi, setDriverUpi] = React.useState<{ upiId: string | null; driverName: string | null; acceptsDriverUpi: boolean } | null>(null);

  React.useEffect(() => {
    let active = true;
    getRide(supabase, params.id)
      .then((r) => {
        if (!active) return;
        setRide(r);
        // Phase E: the passenger may have already chosen a method on the
        // active-ride screen (post-acceptance) via
        // selectRidePaymentMethod() — honor that as the pre-selected
        // default here rather than always defaulting to Cash. They can
        // still change it on this screen; this only changes the starting
        // selection, not the ability to switch.
        if (r?.payment_method === "driver_upi") setMethod(PaymentMethod.DRIVER_UPI);
        else if (r?.payment_method === "online") setMethod(PaymentMethod.ONLINE);
        else if (r?.payment_method === "cash") setMethod(PaymentMethod.CASH);
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

  // Driver UPI QR — generated client-side from the matched driver's
  // registered UPI id (get_matched_driver_upi(), scoped server-side to
  // this passenger's own fare-final ride — never a client-supplied
  // driver id) and this ride's own already-authoritative total_fare. No
  // uploaded QR image involved; a upi://pay URI has nothing secret in it
  // (it's exactly what the driver's own printed QR would encode), so
  // there's no reason to mint it server-side.
  React.useEffect(() => {
    if (method !== PaymentMethod.DRIVER_UPI || !ride) return;
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
            note: `RideIT ride ${params.id.slice(0, 8)}`,
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
  }, [method, params.id, ride, supabase]);

  async function handleCashOrUpiConfirm(selected: PaymentMethod) {
    setConfirming(true);
    try {
      // confirmDirectPayment() is the sole path that marks
      // payment_status='paid' for cash/driver_upi — complete_ride() no
      // longer auto-confirms payment at ride-completion time (see the
      // fix_ride_completion_premature_paid migration). Ride completion
      // and payment completion are separate events; this explicit
      // passenger action is what actually records the payment.
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
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-meter-green/10 text-meter-green"
        >
          <CheckCircle2 size={22} strokeWidth={1.8} />
        </motion.span>
        <h1 className="mt-3 font-display text-2xl font-semibold text-ink">Ride completed</h1>
        <p className="mt-1 text-sm text-ink-soft">Here&apos;s your final fare — calculated by RideIT from your ride&apos;s actual distance.</p>

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

        <p className="mt-6 text-sm font-medium text-ink">Pay with</p>
        <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Payment method">
          {METHODS.map(({ value, label, icon: Icon }) => {
            const active = method === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setMethod(value);
                  setOnlineState("idle");
                  setOnlineError(null);
                }}
                className="flex-1"
              >
                <div
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border bg-surface py-4",
                    active ? "border-2 border-signal-blue bg-tint-blue" : "border-border"
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

        {method === PaymentMethod.DRIVER_UPI && (
          <div className="mt-4">
            <Card className="text-center">
              {qrLoading ? (
                <Skeleton className="mx-auto h-48 w-48" />
              ) : qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a client-generated data: URL, not a static asset
                <img src={qrDataUrl} alt="Scan to pay your driver via UPI" className="mx-auto h-48 w-48 rounded-lg object-contain" />
              ) : driverUpi && !driverUpi.upiId ? (
                <p className="text-sm text-ink-soft">UPI payment unavailable — use Cash instead.</p>
              ) : driverUpi && !driverUpi.acceptsDriverUpi ? (
                <p className="text-sm text-ink-soft">Your driver isn&apos;t accepting Driver UPI right now — use Cash instead.</p>
              ) : (
                <p className="text-sm text-ink-soft">Couldn&apos;t load payment details — use Cash instead.</p>
              )}
              {qrDataUrl && (
                <>
                  <p className="mt-3 text-sm font-medium text-ink">Scan the driver&apos;s QR code to pay ₹{ride?.total_fare}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    UPI ID: {driverUpi?.upiId} {driverUpi?.driverName ? `· ${driverUpi.driverName}` : ""}
                  </p>
                </>
              )}
              <StatusPill tone="pending" className="mt-3">Payment pending</StatusPill>
              <p className="mt-1.5 text-xs text-ink-soft">
                Ride It can&apos;t automatically verify a Driver UPI payment. Tapping &quot;Confirm&quot; below records that you and your
                driver have completed this payment between yourselves — it isn&apos;t proof of transfer.
              </p>
            </Card>
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
