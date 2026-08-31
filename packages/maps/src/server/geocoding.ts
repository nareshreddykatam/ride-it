import { getGoogleMapsGeocodingKey } from "../env";

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

/**
 * Server-only — calls Google's Geocoding API using
 * GOOGLE_MAPS_GEOCODING_API_KEY (never sent to the browser). Only ever
 * called from a Next.js Route Handler (apps/passenger/app/api/geocode/route.ts),
 * once per booking confirmation — not on every keystroke. No
 * autocomplete/address-search API is used here (deliberately out of
 * scope this phase, see Phase 9 review doc's cost-control section) —
 * this is a single address -> coordinates lookup at the moment a
 * passenger confirms their destination selection, which is the smallest
 * correct fix for "the booking flow only ever stored demo coordinates."
 *
 * NOT executable in this environment — maps.googleapis.com is not on this
 * sandbox's network allowlist, and no real API key is configured. The
 * request shape below is correct per Google's current Geocoding API
 * documentation structure; it has not been executed against the live API.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const apiKey = getGoogleMapsGeocodingKey();
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);
  // Bias toward the current service area rather than searching globally —
  // cheap precision improvement, no extra API call.
  url.searchParams.set("region", "in");

  const response = await fetch(url.toString());
  if (!response.ok) return null;

  const data = (await response.json()) as {
    status: string;
    results: Array<{ formatted_address: string; geometry: { location: { lat: number; lng: number } } }>;
  };

  if (data.status !== "OK" || data.results.length === 0) return null;

  const first = data.results[0];
  if (!first) return null;

  return {
    lat: first.geometry.location.lat,
    lng: first.geometry.location.lng,
    formattedAddress: first.formatted_address,
  };
}

export interface ReverseGeocodeResult {
  formattedAddress: string;
}

/**
 * Server-only — the reverse-lookup counterpart to geocodeAddress(), same
 * Google Geocoding API endpoint and key, just `latlng=` instead of
 * `address=` (Google's documented reverse-geocoding usage of this exact
 * endpoint — no separate API/product). Used by the map pin-selection flow
 * (booking/map-select) to show a human-readable address for a
 * passenger-selected coordinate — never to derive coordinates from text,
 * that remains geocodeAddress()'s job.
 *
 * Same "NOT executable in this environment" caveat as geocodeAddress():
 * maps.googleapis.com is not reachable from this sandbox and no real key
 * is configured here — the request shape follows Google's current
 * documented reverse-geocoding format but has not been exercised against
 * the live API in this environment.
 */
export async function reverseGeocodeCoordinates(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const apiKey = getGoogleMapsGeocodingKey();
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) return null;

  const data = (await response.json()) as {
    status: string;
    results: Array<{ formatted_address: string }>;
  };

  if (data.status !== "OK" || data.results.length === 0) return null;

  const first = data.results[0];
  if (!first) return null;

  return { formattedAddress: first.formatted_address };
}
