import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@ride-it/supabase/server";
import { reverseGeocodeCoordinates } from "@ride-it/maps/server/geocoding";

/**
 * POST { lat: number, lng: number } -> { formattedAddress } | { error }
 *
 * Mirrors /api/geocode/route.ts exactly (same auth requirement, same
 * honest-error shape) — the reverse-lookup counterpart used by the map
 * pin-selection flow to show an address for a passenger-selected
 * coordinate. Called once per settled map pan (the map-select page
 * debounces this itself, see booking/map-select/page.tsx), not per frame.
 */
export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { lat?: number; lng?: number } | null;
  if (typeof body?.lat !== "number" || typeof body?.lng !== "number" || !Number.isFinite(body.lat) || !Number.isFinite(body.lng)) {
    return NextResponse.json({ error: "Missing or invalid lat/lng" }, { status: 400 });
  }

  try {
    const result = await reverseGeocodeCoordinates(body.lat, body.lng);
    if (!result) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e) {
    // Includes GOOGLE_MAPS_GEOCODING_API_KEY not being configured — a
    // clean 503, not a raw stack trace, so the caller's "keep the
    // coordinates, show a fallback label" path (Part 12) can react
    // honestly instead of crashing.
    return NextResponse.json({ error: e instanceof Error ? e.message : "Reverse geocoding unavailable" }, { status: 503 });
  }
}
