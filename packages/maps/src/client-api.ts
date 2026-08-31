"use client";

import type { GeocodeResult, ReverseGeocodeResult } from "./server/geocoding";
import type { EtaResult, EtaVehicleType } from "./server/eta";

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

/**
 * Calls this app's own /api/reverse-geocode Route Handler — the reverse
 * counterpart to fetchGeocode(), same "return null on any failure, never
 * throw" contract so callers (the map pin-selection flow) can keep the
 * exact coordinates and show a fallback label rather than blocking the
 * passenger because an address lookup failed (Part 12).
 */
export async function fetchReverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  try {
    const res = await fetch("/api/reverse-geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ReverseGeocodeResult;
  } catch {
    return null;
  }
}

/**
 * Same reasoning as fetchGeocode — calls this app's own /api/eta, returns
 * null (not throws) on failure. Callers are responsible for throttling
 * (see ETA_CONFIG in ./config). `vehicleType` selects the correct Routes
 * API travel mode server-side (see server/eta.ts's travelModeForVehicle)
 * — defaults to "auto" (DRIVE) when the caller doesn't know it yet.
 */
export async function fetchEta(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  vehicleType: EtaVehicleType = "auto"
): Promise<EtaResult | null> {
  try {
    const res = await fetch("/api/eta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin, destination, vehicleType }),
    });
    if (!res.ok) return null;
    return (await res.json()) as EtaResult;
  } catch {
    return null;
  }
}
