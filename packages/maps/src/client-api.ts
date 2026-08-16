"use client";

import type { GeocodeResult } from "./server/geocoding";
import type { EtaResult } from "./server/eta";

/**
 * Calls this app's own /api/geocode Route Handler (relative URL — resolves
 * against whichever app's origin is currently running, no base-URL
 * config needed). Returns null on any failure (not configured, address
 * not found, network error) rather than throwing — callers fall back to
 * their existing default coordinates, per the explicit "do not crash"
 * instruction.
 *
 * Note: only type-only imports from ./server/* here (`import type`) —
 * these are erased at compile time and never pull the server-only
 * modules (with their server-only API keys) into this client bundle.
 */
export async function fetchGeocode(address: string): Promise<GeocodeResult | null> {
  try {
    const res = await fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    if (!res.ok) return null;
    return (await res.json()) as GeocodeResult;
  } catch {
    return null;
  }
}

/** Same reasoning as fetchGeocode — calls this app's own /api/eta, returns null (not throws) on failure. Callers are responsible for throttling (see ETA_CONFIG in ./config). */
export async function fetchEta(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<EtaResult | null> {
  try {
    const res = await fetch("/api/eta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin, destination }),
    });
    if (!res.ok) return null;
    return (await res.json()) as EtaResult;
  } catch {
    return null;
  }
}
