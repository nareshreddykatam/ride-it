import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@ride-it/supabase/server";
import { getEta } from "@ride-it/maps/server/eta";

/**
 * POST { origin: {lat,lng}, destination: {lat,lng} } -> { distanceMeters, durationSeconds } | { error }
 *
 * Same handler as the Passenger app's /api/eta — duplicated only because
 * Next.js Route Handlers must live inside each app's own app/ directory
 * (no cross-app route sharing), but all the actual logic lives once, in
 * @ride-it/maps/server/eta.ts. This file is a thin wrapper, not a second
 * implementation.
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
    | { origin?: { lat: number; lng: number }; destination?: { lat: number; lng: number } }
    | null;

  if (!body?.origin || !body?.destination) {
    return NextResponse.json({ error: "Missing origin/destination" }, { status: 400 });
  }

  try {
    const result = await getEta(body.origin, body.destination);
    if (!result) {
      return NextResponse.json({ error: "No route available" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ETA unavailable" }, { status: 503 });
  }
}
