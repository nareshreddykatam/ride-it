import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@ride-it/supabase/server";
import { createPendingRidePayment, attachRidePaymentOrder } from "@ride-it/data";
import { getPaymentProvider, getRazorpayKeyId, isPaymentGatewayConfigured } from "@ride-it/payments";

/**
 * POST { rideId: string } -> { paymentId, orderId, amount, currency, keyId } | { error }
 *
 * The amount returned here is READ FROM THE DATABASE by
 * create_pending_ride_payment() (the ride's own total_fare) — this
 * handler never accepts, forwards, or trusts an amount from the request
 * body. If two requests race for the same ride, the RPC's own
 * idempotency (an existing non-terminal payment is returned as-is) and
 * the payments_one_in_flight_per_ride unique index both prevent a
 * duplicate order.
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
      { error: "Ridora Online payment is not configured in this environment yet." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as { rideId?: string } | null;
  if (!body?.rideId) {
    return NextResponse.json({ error: "Missing rideId" }, { status: 400 });
  }

  try {
    const payment = await createPendingRidePayment(supabase, body.rideId);

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
      notes: { ride_id: body.rideId },
    });

    const attached = await attachRidePaymentOrder(supabase, payment.id, order.providerOrderId);

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
