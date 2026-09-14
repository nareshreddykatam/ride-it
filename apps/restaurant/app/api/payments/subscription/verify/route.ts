import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@ride-it/supabase/server";
import { markRestaurantSubscriptionPaymentCaptured } from "@ride-it/data";
import { getPaymentProvider } from "@ride-it/payments";

/**
 * POST { paymentId, providerOrderId, providerPaymentId, signature } -> { status } | { error }
 *
 * Mirrors the Passenger app's food/ride payment verify routes exactly.
 * mark_restaurant_subscription_payment_captured has no EXECUTE grant for
 * `authenticated` — this Route Handler, after verifying the Razorpay
 * signature server-side, is the only path that can activate a purchased
 * restaurant subscription.
 */
export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { paymentId?: string; providerOrderId?: string; providerPaymentId?: string; signature?: string }
    | null;

  if (!body?.paymentId || !body.providerOrderId || !body.providerPaymentId || !body.signature) {
    return NextResponse.json({ error: "Missing verification fields" }, { status: 400 });
  }

  const provider = getPaymentProvider();
  const valid = provider.verifyPaymentSignature({
    providerOrderId: body.providerOrderId,
    providerPaymentId: body.providerPaymentId,
    signature: body.signature,
  });

  if (!valid) {
    return NextResponse.json({ status: "verification_pending" });
  }

  const { data: owned } = await supabase
    .from("restaurant_subscription_payments")
    .select("id")
    .eq("id", body.paymentId)
    .eq("provider_order_id", body.providerOrderId)
    .maybeSingle();

  if (!owned) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  try {
    const admin = getSupabaseAdminClient();
    const payment = await markRestaurantSubscriptionPaymentCaptured(admin, body.paymentId, body.providerPaymentId, body.providerOrderId);
    return NextResponse.json({ status: payment.status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Verification failed" }, { status: 400 });
  }
}
