import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@ride-it/supabase/server";
import { processPaymentWebhookEvent } from "@ride-it/data";
import { getPaymentProvider } from "@ride-it/payments";

/**
 * The single canonical webhook endpoint for this deployment — serves
 * BOTH ride payments (`payments` table) and subscription payments
 * (`subscription_payments` table). Razorpay (like most gateways)
 * configures one webhook URL per merchant account, not one per feature,
 * so a single endpoint dispatching by provider_order_id — rather than
 * separate ride/subscription webhook endpoints — is the realistic,
 * correct architecture. See PHASE_11_PAYMENTS_FINANCIAL_INTEGRITY_REVIEW.md
 * for the full reasoning.
 *
 * Uses the SERVICE-ROLE client deliberately: a webhook is an
 * unauthenticated HTTP callback from Razorpay's own servers, not a user
 * session — there is no auth.uid() to check. The entire trust boundary
 * here is the signature verification below; nothing proceeds without it.
 *
 * Idempotency is enforced in the database (payment_webhook_events'
 * unique constraint), not just here — but reading the raw body once and
 * verifying its signature happens exactly once per HTTP request
 * regardless.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature header" }, { status: 400 });
  }

  const provider = getPaymentProvider();
  let result;
  try {
    result = provider.verifyAndParseWebhook(rawBody, signature);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Webhook verification failed" }, { status: 400 });
  }

  if (!result.valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  try {
    await processPaymentWebhookEvent(supabaseAdmin, {
      provider: provider.name,
      providerEventId: result.eventId,
      eventType: result.eventType,
      providerOrderId: result.providerOrderId,
      providerPaymentId: result.providerPaymentId,
      status: result.status,
      payload: JSON.parse(rawBody),
    });
  } catch (e) {
    // Return a 500 so the gateway retries delivery — the idempotency
    // guarantee means a retry is always safe, so failing loudly here
    // (rather than swallowing the error) is the correct choice.
    return NextResponse.json({ error: e instanceof Error ? e.message : "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
