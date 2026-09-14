import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@ride-it/supabase/server";
import { isPaymentGatewayConfigured } from "@ride-it/payments";

/**
 * GET -> { payments: boolean }
 *
 * Mirrors apps/admin/app/api/system-health/route.ts's payments check —
 * lets the subscription page proactively disable "Subscribe" and show an
 * honest message instead of only failing after create-order returns 503.
 */
export async function GET() {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({ payments: isPaymentGatewayConfigured() });
}
