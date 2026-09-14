import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@ride-it/supabase/server";
import { createPendingFoodOrderPayment, attachFoodOrderPaymentOrder } from "@ride-it/data";
import { getPaymentProvider, getRazorpayKeyId, isPaymentGatewayConfigured } from "@ride-it/payments";

/**
 * POST { orderId: string } -> { paymentId, orderId, amount, currency, keyId } | { error }
 *
 * Mirrors apps/passenger/app/api/payments/create-order/route.ts exactly.
 * The amount returned here is READ FROM THE DATABASE by
 * create_pending_food_order_payment() (the order's own total_amount) —
 * this handler never accepts, forwards, or trusts an amount from the
 * request body.
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

  const body = (await request.json().catch(() => null)) as { orderId?: string } | null;
  if (!body?.orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }

  try {
    const payment = await createPendingFoodOrderPayment(supabase, body.orderId);

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
      notes: { food_order_id: body.orderId },
    });

    const attached = await attachFoodOrderPaymentOrder(supabase, payment.id, order.providerOrderId);

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
