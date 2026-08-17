import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@ride-it/supabase/server";
import { markRidePaymentCaptured } from "@ride-it/data";
import { getPaymentProvider } from "@ride-it/payments";

/**
 * POST { paymentId, providerOrderId, providerPaymentId, signature } -> { status } | { error }
 *
 * This is the "immediate UI confirmation" path the brief explicitly
 * permits alongside webhooks — NOT a replacement for the webhook, which
 * remains the durable, authoritative reconciliation (see
 * apps/passenger/app/api/payments/webhook/route.ts). This path is only
 * ever trusted here because the signature is verified server-side with
 * the real secret key BEFORE calling mark_ride_payment_captured — a
 * client claiming "it succeeded" without a valid signature changes
 * nothing.
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
    // Deliberately does NOT call mark_ride_payment_failed — an invalid
    // signature means we can't trust this claim at all, not that the
    // payment definitely failed. The webhook remains authoritative for
    // what actually happened. Per the brief: show "verification
    // pending", not "successful" or "failed".
    return NextResponse.json({ status: "verification_pending" });
  }

  try {
    const payment = await markRidePaymentCaptured(supabase, body.paymentId, body.providerPaymentId, body.providerOrderId);
    return NextResponse.json({ status: payment.status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Verification failed" }, { status: 400 });
  }
}
