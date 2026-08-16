import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@ride-it/supabase/server";
import { geocodeAddress } from "@ride-it/maps/server/geocoding";

/**
 * POST { address: string } -> { lat, lng, formattedAddress } | { error }
 *
 * Requires an authenticated Supabase session (checked via the request's
 * own cookies through getSupabaseServerClient) — this is not an open
 * geocoding proxy anyone can hit to burn the project's API quota.
 *
 * Called once per booking confirmation (see the Passenger app's
 * booking/confirm screen), not per keystroke — no autocomplete here.
 */
export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { address?: string } | null;
  if (!body?.address || typeof body.address !== "string") {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  try {
    const result = await geocodeAddress(body.address);
    if (!result) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e) {
    // Includes the case where GOOGLE_MAPS_GEOCODING_API_KEY isn't
    // configured (getGoogleMapsGeocodingKey() throws) — surfaced as a
    // clean 503 rather than a raw stack trace, so the booking flow's
    // fallback-to-demo-coordinates path (see the client call site) can
    // react to it honestly instead of crashing.
    return NextResponse.json({ error: e instanceof Error ? e.message : "Geocoding unavailable" }, { status: 503 });
  }
}
