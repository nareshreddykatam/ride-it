import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@ride-it/supabase/server";
import { createPendingSubscriptionPayment, attachSubscriptionPaymentOrder } from "@ride-it/data";
import { getPaymentProvider, getRazorpayKeyId, isPaymentGatewayConfigured } from "@ride-it/payments";

/**
 * POST { plan } -> { paymentId, orderId, amount, currency, keyId } | { error }
 *
 * amount is read from subscription_plans by create_pending_subscription_payment()
 * — never accepted from the request body. Same pattern as
 * apps/passenger/app/api/payments/create-order/route.ts.
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
    return NextResponse.json(
      { error: "Online subscription payment is not configured in this environment yet." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as { plan?: string } | null;
  if (!body?.plan) {
    return NextResponse.json({ error: "Missing plan" }, { status: 400 });
  }

  try {
    const payment = await createPendingSubscriptionPayment(
      supabase,
      body.plan as "daily" | "weekly" | "monthly" | "yearly"
    );

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
      notes: { subscription_id: payment.subscription_id, plan: body.plan },
    });

    const attached = await attachSubscriptionPaymentOrder(supabase, payment.id, order.providerOrderId);

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
