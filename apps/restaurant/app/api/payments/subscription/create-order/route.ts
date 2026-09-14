import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@ride-it/supabase/server";
import { attachRestaurantSubscriptionPaymentOrder } from "@ride-it/data";
import { getPaymentProvider, getRazorpayKeyId, isPaymentGatewayConfigured } from "@ride-it/payments";

/**
 * POST { paymentId: string } -> { paymentId, orderId, amount, currency, keyId } | { error }
 *
 * The client already created the pending payment row (via
 * create_pending_restaurant_subscription_payment, which itself re-derives
 * the amount from restaurant_subscription_plans — never a client
 * parameter). This handler reads that row back with the caller's own
 * RLS-scoped session (restaurant_subscription_payments_select_own_owner),
 * so it can only ever act on a payment the caller's own restaurant owns.
 */
export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!isPaymentGatewayConfigured()) {
    return NextResponse.json({ error: "Online payment is not configured in this environment yet." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { paymentId?: string } | null;
  if (!body?.paymentId) {
    return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });
  }

  const { data: paymentRow, error: fetchError } = await supabase
    .from("restaurant_subscription_payments")
    .select("id, amount, currency, provider_order_id")
    .eq("id", body.paymentId)
    .maybeSingle();

  if (fetchError || !paymentRow) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  // packages/supabase/src/types.ts is still the Phase 3 placeholder
  // Database type (Tables: Record<string, never>), so PostgREST's return
  // type here is `never` until real types are generated — same cast
  // idiom used elsewhere in this codebase (e.g. packages/auth/src/
  // context.tsx's loadProfile()).
  const payment = paymentRow as unknown as { id: string; amount: number; currency: string; provider_order_id: string | null };

  try {
    if (payment.provider_order_id) {
      return NextResponse.json({
        paymentId: payment.id,
        orderId: payment.provider_order_id,
        amount: payment.amount,
        currency: payment.currency,
        keyId: getRazorpayKeyId(),
      });
    }

    const provider = getPaymentProvider();
    const order = await provider.createOrder({
      amountInSmallestUnit: Math.round(payment.amount * 100),
      currency: payment.currency,
      receipt: payment.id,
      notes: { restaurant_subscription_payment_id: payment.id },
    });

    const attached = await attachRestaurantSubscriptionPaymentOrder(supabase, payment.id, order.providerOrderId);

    return NextResponse.json({
      paymentId: attached.id,
      orderId: attached.provider_order_id,
      amount: attached.amount,
      currency: attached.currency,
      keyId: getRazorpayKeyId(),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't start payment" }, { status: 400 });
  }
}
