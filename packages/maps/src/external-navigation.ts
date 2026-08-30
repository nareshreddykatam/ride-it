import type { LatLng } from "./components/RideMap";

/**
 * The universal Google Maps web-navigation URL
 * (https://developers.google.com/maps/documentation/urls/get-started#directions-action)
 * — NOT the Maps JS API, NOT a paid SKU, no API key involved. On a phone
 * with the Google Maps app installed, both Android and iOS intercept this
 * URL and open the native app directly into turn-by-turn navigation; with
 * no app installed it opens Google Maps in the browser instead. That
 * "installed app, else web" fallback is Google's own behavior for this URL
 * shape, not something this function needs to detect/implement itself.
 *
 * Deliberately the ENTIRE navigation surface RideIT touches for the driver
 * — no turn-by-turn is rendered in-app (see Phase 7 of the map-ecosystem
 * task brief: "Do not implement turn-by-turn navigation inside RideIT").
 */
export function getExternalNavigationUrl(destination: LatLng): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}
