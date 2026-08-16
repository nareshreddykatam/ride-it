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
 */
export function watchDriverLocation(options: GeolocationWatchOptions): () => void {
  const minIntervalMs = options.minIntervalMs ?? LOCATION_CONFIG.ACTIVE_RIDE_MIN_INTERVAL_MS;
  const minMovementMeters = options.minMovementMeters ?? LOCATION_CONFIG.MIN_MOVEMENT_METERS;

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    options.onError("not_supported");
    return () => {};
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
    (err) => options.onError(mapGeolocationError(err)),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );

  return () => navigator.geolocation.clearWatch(watchId);
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
