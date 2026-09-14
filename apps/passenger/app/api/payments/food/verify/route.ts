import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@ride-it/supabase/server";
import { markFoodOrderPaymentCaptured } from "@ride-it/data";
import { getPaymentProvider } from "@ride-it/payments";

/**
 * POST { paymentId, providerOrderId, providerPaymentId, signature } -> { status } | { error }
 *
 * Mirrors apps/passenger/app/api/payments/verify/route.ts exactly,
 * including the ownership re-check with the caller's own RLS-scoped
 * session BEFORE the service-role capture call — mark_food_order_payment_
 * captured has no EXECUTE grant for `authenticated` at all (matches the
 * ride/subscription payment RPCs' AUDIT-001 hardening), so this Route
 * Handler, after verifying the Razorpay signature server-side, is the
 * only path that can complete a food payment.
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
    .from("food_order_payments")
    .select("id")
    .eq("id", body.paymentId)
    .eq("provider_order_id", body.providerOrderId)
    .maybeSingle();

  if (!owned) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  try {
    const admin = getSupabaseAdminClient();
    const payment = await markFoodOrderPaymentCaptured(admin, body.paymentId, body.providerPaymentId, body.providerOrderId);
    return NextResponse.json({ status: payment.status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Verification failed" }, { status: 400 });
  }
}
