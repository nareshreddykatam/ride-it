import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@ride-it/supabase/server";
import { markSubscriptionPaymentCaptured } from "@ride-it/data";
import { getPaymentProvider } from "@ride-it/payments";

/**
 * POST { paymentId, providerOrderId, providerPaymentId, signature } -> { status } | { error }
 * Same reasoning as apps/passenger/app/api/payments/verify/route.ts —
 * immediate-feedback path, signature verified server-side first, webhook
 * remains the durable authoritative reconciliation.
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

  // Ownership, re-established explicitly — see the identical comment in
  // apps/passenger/app/api/payments/verify/route.ts. Phase 1 audit
  // (AUDIT-001) reproduced a driver activating a paid subscription for
  // free by calling mark_subscription_payment_captured() directly, so that
  // RPC is now service-role only and this RLS-scoped read is what proves
  // the payment belongs to the caller.
  const { data: owned } = await supabase
    .from("subscription_payments")
    .select("id")
    .eq("id", body.paymentId)
    .eq("provider_order_id", body.providerOrderId)
    .maybeSingle();

  if (!owned) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  try {
    const admin = getSupabaseAdminClient();
    const payment = await markSubscriptionPaymentCaptured(admin, body.paymentId, body.providerPaymentId, body.providerOrderId);
    return NextResponse.json({ status: payment.status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Verification failed" }, { status: 400 });
  }
}
