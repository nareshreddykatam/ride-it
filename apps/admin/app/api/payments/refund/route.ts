import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@ride-it/supabase/server";
import { recordRidePaymentRefund } from "@ride-it/data";
import { getPaymentProvider, isPaymentGatewayConfigured } from "@ride-it/payments";

/**
 * POST { paymentId, refundAmount? } -> { status, refundId } | { error }
 *
 * Admin-only. The actual enforcement boundary is inside
 * record_ride_payment_refund() itself (is_admin() check) — this handler
 * doesn't separately gate on role, it relies on that RPC to reject a
 * non-admin caller.
 *
 * Never marks a refund complete without a real gateway response — if
 * isPaymentGatewayConfigured() is false, this returns a clear 503
 * instead of pretending to succeed.
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
      { error: "No payment gateway is configured in this environment — refunds cannot be processed." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as { paymentId?: string; refundAmount?: number } | null;
  if (!body?.paymentId) {
    return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });
  }

  try {
    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select("id, amount, provider_payment_id, status")
      .eq("id", body.paymentId)
      .single();
    if (fetchError) throw fetchError;

    const paymentRow = payment as unknown as { id: string; amount: number; provider_payment_id: string | null; status: string };

    if (paymentRow.status !== "captured") {
      return NextResponse.json({ error: "Only a captured payment can be refunded" }, { status: 400 });
    }
    if (!paymentRow.provider_payment_id) {
      return NextResponse.json({ error: "Payment has no gateway reference to refund" }, { status: 400 });
    }

    const refundAmount = body.refundAmount ?? paymentRow.amount;
    const provider = getPaymentProvider();
    const refund = await provider.initiateRefund({
      providerPaymentId: paymentRow.provider_payment_id,
      amountInSmallestUnit: Math.round(refundAmount * 100),
    });

    const recorded = await recordRidePaymentRefund(supabase, body.paymentId, refund.providerRefundId, refundAmount);

    return NextResponse.json({ status: recorded.status, refundId: refund.providerRefundId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Refund failed" }, { status: 400 });
  }
}
