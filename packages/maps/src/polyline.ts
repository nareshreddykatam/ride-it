/**
 * Decodes Google's "encoded polyline" format (the standard, unchanging
 * algorithm documented at
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 * — the same encoding the Routes API returns in
 * routes.polyline.encodedPolyline, and the same one the deprecated
 * google.maps.geometry.encoding library implements). Reimplemented here
 * directly (a few lines, no dependency) rather than pulling in the
 * "geometry" library for one function.
 *
 * Pure and framework-agnostic — no Google Maps runtime dependency, so it
 * can decode a route server-side or client-side identically, and is
 * trivially unit-testable without a live API key.
 */
export interface LatLngLiteral {
  lat: number;
  lng: number;
}

export function decodePolyline(encoded: string): LatLngLiteral[] {
  const points: LatLngLiteral[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

/**
 * Great-circle distance in meters — used ONLY to space out the route-draw
 * reveal animation proportionally to real segment length (so a route with
 * a few long straight stretches and one dense curvy section doesn't reveal
 * unevenly, snapping through the dense part and crawling the sparse one).
 * Never used for fare, ETA, or any other real distance figure — those stay
 * on their own dedicated implementations (packages/data's haversineKm for
 * the fare floor, geolocation.ts's distanceMeters for the GPS-write
 * throttle) — this is a small, self-contained visual-only utility, same
 * "purpose-scoped, not shared spatial truth" pattern already used by both.
 */
function haversineMeters(a: LatLngLiteral, b: LatLngLiteral): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Returns the leading portion of `points` covering `fraction` (0..1) of the
 * path's total real-world length, with the cut point linearly interpolated
 * between the two straddling vertices — not just truncated to the nearest
 * original point — so a requestAnimationFrame loop calling this every frame
 * produces a smooth, constant-speed "line drawing itself in" reveal
 * regardless of how unevenly the source polyline's vertices are spaced.
 * `fraction <= 0` returns just the start point; `fraction >= 1` (or fewer
 * than 2 points) returns the input unchanged.
 */
export function computePartialPath(points: LatLngLiteral[], fraction: number): LatLngLiteral[] {
  if (points.length < 2 || fraction >= 1) return points;
  const first = points[0];
  if (!first) return [];
  if (fraction <= 0) return [first];

  // Indices below are always within [0, points.length) by construction (the
  // loops run i in [1, points.length)), but noUncheckedIndexedAccess can't
  // see that from the loop bound alone — `!` asserts what the loop
  // structure already guarantees, not an unchecked assumption.
  let total = 0;
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1]!, points[i]!);
    cumulative.push(total);
  }
  if (total === 0) return points;

  const target = total * fraction;
  const result: LatLngLiteral[] = [first];
  for (let i = 1; i < points.length; i++) {
    if (cumulative[i]! < target) {
      result.push(points[i]!);
      continue;
    }
    const segStart = cumulative[i - 1]!;
    const segLen = cumulative[i]! - segStart;
    const segFraction = segLen > 0 ? (target - segStart) / segLen : 0;
    const a = points[i - 1]!;
    const b = points[i]!;
    result.push({
      lat: a.lat + (b.lat - a.lat) * segFraction,
      lng: a.lng + (b.lng - a.lng) * segFraction,
    });
    break;
  }
  return result;
}
