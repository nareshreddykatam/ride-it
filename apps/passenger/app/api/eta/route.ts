import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@ride-it/supabase/server";
import { getEta, type EtaVehicleType } from "@ride-it/maps/server/eta";

const VALID_VEHICLE_TYPES: EtaVehicleType[] = ["bike", "scooty", "auto", "car"];

/**
 * POST { origin: {lat,lng}, destination: {lat,lng} } -> { distanceMeters, durationSeconds } | { error }
 *
 * Requires auth, same reasoning as /api/geocode. Throttling (how often the
 * client is even allowed to call this) is enforced client-side via
 * ETA_CONFIG (@ride-it/maps's config) — this handler itself just makes one
 * Routes API call per request, per the "cost-control is a call-site
 * concern" note in server/eta.ts.
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
    | { origin?: { lat: number; lng: number }; destination?: { lat: number; lng: number }; vehicleType?: string }
    | null;

  if (!body?.origin || !body?.destination) {
    return NextResponse.json({ error: "Missing origin/destination" }, { status: 400 });
  }

  const vehicleType = VALID_VEHICLE_TYPES.includes(body.vehicleType as EtaVehicleType)
    ? (body.vehicleType as EtaVehicleType)
    : "auto";

  try {
    const result = await getEta(body.origin, body.destination, vehicleType);
    if (!result) {
      return NextResponse.json({ error: "No route available" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ETA unavailable" }, { status: 503 });
  }
}
