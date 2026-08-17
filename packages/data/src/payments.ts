import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentRow, RideRow } from "./types";

/** Step 1 — server re-derives the amount from the ride itself, never a parameter. Idempotent (returns an existing in-flight attempt if one exists). */
export async function createPendingRidePayment(supabase: SupabaseClient, rideId: string): Promise<PaymentRow> {
  const { data, error } = await supabase.rpc("create_pending_ride_payment", { p_ride_id: rideId });
  if (error) throw error;
  return data as unknown as PaymentRow;
}

/**
 * Phase 16 fix — the actual path that marks a cash/driver_upi ride paid.
 * complete_ride() (Phase 11) only auto-confirms payment if payment_method
 * was ALREADY set when it runs — but the real UI flow lets the passenger
 * choose their payment method only AFTER the ride completes, so that
 * branch was effectively unreachable in practice. This is the function
 * that actually closes the loop; called from the ride-complete screen
 * when the passenger confirms cash/driver_upi, not setRidePaymentMethod
 * (which only sets the method, never payment_status — payment_status is
 * a protected column, unwritable by any plain client update).
 */
export async function confirmDirectPayment(
  supabase: SupabaseClient,
  rideId: string,
  method: "cash" | "driver_upi"
): Promise<RideRow> {
  const { data, error } = await supabase.rpc("confirm_direct_payment", { p_ride_id: rideId, p_method: method });
  if (error) throw error;
  return data as unknown as RideRow;
}

/** Step 3 — attaches the gateway's order id after the caller's Route Handler created it. */
export async function attachRidePaymentOrder(
  supabase: SupabaseClient,
  paymentId: string,
  providerOrderId: string
): Promise<PaymentRow> {
  const { data, error } = await supabase.rpc("attach_ride_payment_order", {
    p_payment_id: paymentId,
    p_provider_order_id: providerOrderId,
  });
  if (error) throw error;
  return data as unknown as PaymentRow;
}

export async function getRidePayment(supabase: SupabaseClient, rideId: string): Promise<PaymentRow | null> {
  const { data, error } = await supabase.rpc("get_ride_payment", { p_ride_id: rideId });
  if (error) throw error;
  return (data as unknown as PaymentRow | null) ?? null;
}

/**
 * Called from Route Handlers only (after server-side signature
 * verification or from the webhook handler) — never from a UI component
 * directly. providerOrderId is required (20260825090000) — the RPC
 * rejects (silently, no state change) any order id that doesn't match
 * the one actually attached to paymentId via attachRidePaymentOrder,
 * closing a cross-order/payment confusion vulnerability: a validly-signed
 * payment for one order could otherwise be replayed against a different,
 * more expensive ride's payment record.
 */
export async function markRidePaymentCaptured(
  supabase: SupabaseClient,
  paymentId: string,
  providerPaymentId: string,
  providerOrderId: string
): Promise<PaymentRow> {
  const { data, error } = await supabase.rpc("mark_ride_payment_captured", {
    p_payment_id: paymentId,
    p_provider_payment_id: providerPaymentId,
    p_provider_order_id: providerOrderId,
  });
  if (error) throw error;
  return data as unknown as PaymentRow;
}

/** Admin-only refund recording, called after the Route Handler's real gateway refund call succeeds. */
export async function recordRidePaymentRefund(
  supabase: SupabaseClient,
  paymentId: string,
  refundId: string,
  refundedAmount: number
): Promise<PaymentRow> {
  const { data, error } = await supabase.rpc("record_ride_payment_refund", {
    p_payment_id: paymentId,
    p_refund_id: refundId,
    p_refunded_amount: refundedAmount,
  });
  if (error) throw error;
  return data as unknown as PaymentRow;
}

/**
 * Calls process_payment_webhook_event() — used only from the webhook
 * Route Handler with a service-role client (getSupabaseAdminClient()).
 * Accepts any SupabaseClient since the underlying RPC's own execute
 * grant (service_role only) is the actual enforcement, not this
 * wrapper's caller.
 */
export async function processPaymentWebhookEvent(
  supabase: SupabaseClient,
  params: {
    provider: string;
    providerEventId: string;
    eventType: string;
    providerOrderId: string | null;
    providerPaymentId: string | null;
    status: string;
    payload: unknown;
  }
): Promise<void> {
  const { error } = await supabase.rpc("process_payment_webhook_event", {
    p_provider: params.provider,
    p_provider_event_id: params.providerEventId,
    p_event_type: params.eventType,
    p_provider_order_id: params.providerOrderId,
    p_provider_payment_id: params.providerPaymentId,
    p_status: params.status,
    p_payload: params.payload,
  });
  if (error) throw error;
}

/**
 * Subscribes to changes on a specific payment row — used by the checkout
 * screen to react live if a webhook resolves the payment's status after
 * (or instead of, if the browser closed) the client-side verify call.
 * RLS (payments_select_own_passenger) scopes this to the owning
 * passenger's own payments only.
 */
export function subscribeToPayment(supabase: SupabaseClient, paymentId: string, onChange: (payment: PaymentRow) => void) {
  const channel = supabase
    .channel(`payment:${paymentId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "payments", filter: `id=eq.${paymentId}` },
      (payload) => onChange(payload.new as unknown as PaymentRow)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
