import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@ride-it/supabase/server";
import { isGoogleMapsConfigured } from "@ride-it/maps";
import { isPaymentGatewayConfigured } from "@ride-it/payments";

/**
 * GET -> { maps: boolean, payments: boolean }
 *
 * isPaymentGatewayConfigured() reads RAZORPAY_KEY_ID/SECRET, both
 * server-only env vars — they don't exist in the browser bundle at all, so
 * this check can only run here, not directly in the "use client" Command
 * Center page. isGoogleMapsConfigured() reads a NEXT_PUBLIC_ var and could
 * technically run client-side too, but is included here so the Command
 * Center makes one fetch instead of two different checks in two places.
 *
 * Deliberately does NOT attempt to report SMS (MSG91) or Push (FCM)
 * configuration — those secrets live only in Supabase Edge Function
 * secrets, which this (or any) Next.js app has no way to read at all, not
 * even server-side. The Command Center must show that limitation
 * honestly rather than guessing.
 */
export async function GET() {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    maps: isGoogleMapsConfigured(),
    payments: isPaymentGatewayConfigured(),
  });
}
