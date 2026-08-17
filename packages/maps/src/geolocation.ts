"use client";

import { LOCATION_CONFIG } from "./config";

export type GeolocationErrorReason = "permission_denied" | "position_unavailable" | "timeout" | "not_supported";

export interface GeolocationWatchOptions {
  /** Minimum ms between accepted updates. */
  minIntervalMs?: number;
  /** Minimum meters moved before an update is accepted, even if the interval has elapsed. */
  minMovementMeters?: number;
  onUpdate: (position: { lat: number; lng: number }) => void;
  onError: (reason: GeolocationErrorReason) => void;
}

/** Haversine distance in meters — used only for the client-side "is this update worth sending" throttle decision, never as production spatial truth (that stays PostGIS, server-side, per Phase 9's explicit instruction). */
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function mapGeolocationError(err: GeolocationPositionError): GeolocationErrorReason {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "permission_denied";
    case err.POSITION_UNAVAILABLE:
      return "position_unavailable";
    case err.TIMEOUT:
      return "timeout";
    default:
      return "position_unavailable";
  }
}

/**
 * DEV-ONLY simulated movement, used solely as watchDriverLocation()'s
 * fallback when real geolocation is unavailable/denied in a non-production
 * build (see the NODE_ENV guard below — this code path is structurally
 * unreachable in a production bundle, not just conditionally skipped).
 * Walks a small deterministic loop around a fixed Vijayawada point (the
 * operating/demo city — Part 15) so a driver's marker visibly moves
 * during local/E2E testing instead of silently going dark or sitting on
 * one unchanging coordinate that the server-authoritative freshness
 * trigger would never treat as a real update.
 */
const DEV_SIMULATED_BASE = { lat: 16.5062, lng: 80.648 };
function devSimulatedPosition(tickIndex: number): { lat: number; lng: number } {
  const angle = (tickIndex % 20) * (Math.PI / 10);
  const radiusDeg = 0.003; // ~300m
  return {
    lat: DEV_SIMULATED_BASE.lat + Math.sin(angle) * radiusDeg,
    lng: DEV_SIMULATED_BASE.lng + Math.cos(angle) * radiusDeg,
  };
}

/**
 * Starts a continuous geolocation watch (navigator.geolocation.watchPosition,
 * not repeated getCurrentPosition polling) with time+distance throttling
 * applied before onUpdate ever fires — callers don't need to implement
 * their own throttling. Returns a cleanup function; always call it on
 * unmount / when tracking should stop (ride completes, driver goes
 * offline) to avoid leaking a watcher, per the explicit cleanup
 * requirement.
 *
 * Handles denied permission, unavailable position, timeout, and
 * unsupported browsers via onError rather than throwing — the caller
 * decides how to render an honest state for each.
 *
 * DEV-ONLY FALLBACK: if real geolocation is unavailable/denied/times out
 * AND `process.env.NODE_ENV !== "production"`, this falls back to a
 * simulated moving position (see devSimulatedPosition above) instead of
 * going permanently dark for the rest of the ride — this closed a real
 * gap where active-ride tracking had no fallback at all, unlike the
 * Dashboard's online-ping. The fallback NEVER activates in a production
 * build (the NODE_ENV check is compiled away by the bundler in prod, so
 * this isn't just conditionally-off, the code path doesn't exist in the
 * production bundle) and every simulated update logs a loud, unmistakable
 * console.warn so it can never be mistaken for real GPS data even in dev.
 */
export function watchDriverLocation(options: GeolocationWatchOptions): () => void {
  const minIntervalMs = options.minIntervalMs ?? LOCATION_CONFIG.ACTIVE_RIDE_MIN_INTERVAL_MS;
  const minMovementMeters = options.minMovementMeters ?? LOCATION_CONFIG.MIN_MOVEMENT_METERS;
  const devFallbackAllowed = process.env.NODE_ENV !== "production";

  let devFallbackInterval: ReturnType<typeof setInterval> | null = null;
  let devTick = 0;

  // Always surfaces the real error to the caller first, in every
  // environment including production — the dev simulation (if any) is a
  // strictly additional behavior layered on top, never a replacement for
  // honest error reporting.
  function handleGeolocationError(reason: GeolocationErrorReason) {
    options.onError(reason);
    if (!devFallbackAllowed || devFallbackInterval) return;
    // eslint-disable-next-line no-console
    console.warn(
      `[DEV ONLY] Real geolocation unavailable (${reason}) — simulating driver movement for active-ride tracking. This NEVER happens in a production build.`
    );
    const emit = () => options.onUpdate(devSimulatedPosition(devTick++));
    emit();
    devFallbackInterval = setInterval(emit, Math.max(minIntervalMs, 5000));
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    handleGeolocationError("not_supported");
    return () => {
      if (devFallbackInterval) clearInterval(devFallbackInterval);
    };
  }

  let lastAcceptedAt = 0;
  let lastAcceptedPosition: { lat: number; lng: number } | null = null;

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const now = Date.now();
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };

      const enoughTimePassed = now - lastAcceptedAt >= minIntervalMs;
      const movedEnough = !lastAcceptedPosition || distanceMeters(lastAcceptedPosition, next) >= minMovementMeters;

      if (!lastAcceptedPosition || (enoughTimePassed && movedEnough)) {
        lastAcceptedAt = now;
        lastAcceptedPosition = next;
        options.onUpdate(next);
      }
    },
    (err) => handleGeolocationError(mapGeolocationError(err)),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
    if (devFallbackInterval) clearInterval(devFallbackInterval);
  };
}

/** One-shot position fetch (not a continuous watch) — used for the Passenger app's "use my current location as pickup" at booking time, not for ongoing tracking. */
export function getCurrentPositionOnce(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}
