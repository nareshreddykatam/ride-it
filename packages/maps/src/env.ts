/**
 * Google Maps environment configuration. Deliberately the OPPOSITE pattern
 * from @ride-it/supabase/env.ts: Supabase env vars are required and
 * missing ones throw immediately (fail closed — the app has no meaningful
 * behavior without a database). A missing Maps key must NOT crash the
 * app — Passenger/Driver/Admin all have a real, honest fallback (see
 * ./fallback) when Maps isn't configured, per Phase 9's explicit
 * instruction not to make the app unusable without a production key.
 *
 * Three separate keys, matching three separate Google Maps Platform
 * products with different trust/cost profiles:
 *
 *   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
 *     Client-side, for Maps JS API rendering only. Safe to expose to the
 *     browser IF restricted by HTTP referrer in Google Cloud Console
 *     (documented in .env.example) — this is the standard, intended usage
 *     pattern for this specific key type.
 *
 *   GOOGLE_MAPS_GEOCODING_API_KEY
 *     Server-only. Used exclusively inside Next.js Route Handlers
 *     (apps/passenger/app/api/geocode/route.ts). Never sent to the
 *     browser — see server/geocoding.ts, which is not exported from this
 *     package's client-safe barrel.
 *
 *   GOOGLE_MAPS_ROUTES_API_KEY
 *     Server-only, same reasoning, used by server/eta.ts.
 *
 * Kept as three separate keys (not one shared key) so each Google Cloud
 * API can have its own quota, budget alert, and restriction — a leaked or
 * over-quota rendering key can't also exhaust geocoding/routing budget.
 */

export function getGoogleMapsBrowserKey(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || null;
}

export function isGoogleMapsConfigured(): boolean {
  return getGoogleMapsBrowserKey() !== null;
}

/** Server-only — throws if accidentally called from a browser bundle, matching @ride-it/supabase's pattern for its service-role key. */
export function getGoogleMapsGeocodingKey(): string {
  if (typeof window !== "undefined") {
    throw new Error("[@ride-it/maps] getGoogleMapsGeocodingKey() must never be called from the browser.");
  }
  const key = process.env.GOOGLE_MAPS_GEOCODING_API_KEY;
  if (!key) {
    throw new Error(
      "[@ride-it/maps] Missing GOOGLE_MAPS_GEOCODING_API_KEY. Set it in this app's .env.local (server-only — do not prefix with NEXT_PUBLIC_)."
    );
  }
  return key;
}

/** Server-only — same reasoning as getGoogleMapsGeocodingKey(). */
export function getGoogleMapsRoutesKey(): string {
  if (typeof window !== "undefined") {
    throw new Error("[@ride-it/maps] getGoogleMapsRoutesKey() must never be called from the browser.");
  }
  const key = process.env.GOOGLE_MAPS_ROUTES_API_KEY;
  if (!key) {
    throw new Error(
      "[@ride-it/maps] Missing GOOGLE_MAPS_ROUTES_API_KEY. Set it in this app's .env.local (server-only — do not prefix with NEXT_PUBLIC_)."
    );
  }
  return key;
}
