import { getGoogleMapsRoutesKey } from "../env";

export interface EtaResult {
  distanceMeters: number;
  durationSeconds: number;
  /** Google's encoded polyline format (decode client-side via @ride-it/maps's decodePolyline) — null if the Routes API omitted it (shouldn't happen given the field mask below, but never assumed). */
  encodedPolyline: string | null;
}

/** Matches public.vehicle_type_enum (packages/data's DB vehicle type strings) — not the whole VehicleType UI enum, to keep this server module independent of @ride-it/types. */
export type EtaVehicleType = "bike" | "scooty" | "auto" | "car";

/**
 * Bike/Scooty really do route differently from Auto/Car in Indian traffic
 * (narrower cuts, different one-way exemptions) — the Routes API models
 * that distinction via travelMode, not a vehicle-specific parameter. This
 * was previously hardcoded to "TWO_WHEELER" for every call regardless of
 * which vehicle type the estimate was actually for, silently giving
 * Auto/Car passengers a two-wheeler route (a real correctness bug, not
 * just a naming nit — a two-wheeler route can legally use lanes/cuts a
 * car cannot, so its distance/duration don't represent a car trip).
 */
function travelModeForVehicle(vehicleType: EtaVehicleType): "TWO_WHEELER" | "DRIVE" {
  return vehicleType === "bike" || vehicleType === "scooty" ? "TWO_WHEELER" : "DRIVE";
}

/**
 * Server-only — calls Google's current Routes API
 * (routes.googleapis.com/directions/v2:computeRoutes), the recommended
 * replacement for the older DirectionsService/DistanceMatrixService for
 * new server-side integrations, using GOOGLE_MAPS_ROUTES_API_KEY (never
 * sent to the browser). This is deliberately a separate key from both the
 * rendering key and the geocoding key — Routes API billing/quota is
 * tracked independently, per the brief's explicit "separate configuration
 * conceptually" instruction.
 *
 * Callers are responsible for throttling (see ETA_CONFIG in ../config.ts
 * and its usage in the Passenger/Driver tracking hooks) — this function
 * itself makes exactly one API call per invocation and does not rate-limit
 * internally, since that's a call-site concern (how often is a new ETA
 * actually needed), not this function's.
 *
 * NOT executable in this environment — same network/key caveat as
 * geocoding.ts. Request shape follows the current Routes API structure
 * (field mask required, POST body, X-Goog-Api-Key header) — not executed
 * against the live API.
 */
export async function getEta(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  vehicleType: EtaVehicleType = "auto"
): Promise<EtaResult | null> {
  const apiKey = getGoogleMapsRoutesKey();

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      // Field mask is required by the Routes API — requesting only what
      // this app actually uses (distance + duration + the route geometry
      // for map display), not the full turn-by-turn steps.
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: travelModeForVehicle(vehicleType),
    }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    routes?: Array<{ distanceMeters: number; duration: string; polyline?: { encodedPolyline: string } }>;
  };
  const route = data.routes?.[0];
  if (!route) return null;

  return {
    distanceMeters: route.distanceMeters,
    durationSeconds: parseInt(route.duration.replace("s", ""), 10) || 0,
    encodedPolyline: route.polyline?.encodedPolyline ?? null,
  };
}
