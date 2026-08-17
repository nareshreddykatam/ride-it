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
