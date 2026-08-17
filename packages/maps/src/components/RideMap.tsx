"use client";

import * as React from "react";
import { cn } from "@ride-it/ui";
import { isGoogleMapsConfigured } from "../env";
import { loadGoogleMaps } from "../loader";
import { MockMap, type MockMapProps } from "../fallback/MockMapFallback";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RideMapProps {
  className?: string;
  pickup?: LatLng;
  drop?: LatLng;
  driverLocation?: LatLng | null;
  /** Passed straight through to the fallback so it still looks contextually right when no key is configured — same variant vocabulary as before. */
  fallbackVariant?: MockMapProps["variant"];
  fallbackProgress?: number;
  /** True when driverLocation's underlying timestamp is older than the configured freshness threshold — renders an honest "may be outdated" indicator instead of pretending a stale dot is live. */
  driverLocationStale?: boolean;
  /** Decoded route geometry (see @ride-it/maps's decodePolyline, fed from server/eta.ts's encodedPolyline) — drawn as a Polyline when present. Omit to show only markers, unchanged from before. */
  routePolyline?: LatLng[];
}

// Vijayawada, Andhra Pradesh — the operating/demo city (Part 15). Used only
// as the initial map center before pickup/drop are known; every other
// coordinate on the map comes from real props.
const DEFAULT_CITY_CENTER: LatLng = { lat: 16.5062, lng: 80.648 };

type LoadState = "idle" | "loading" | "ready" | "error";

/**
 * The one component in this codebase that touches the Google Maps JS API.
 * Renders MockMap (the explicit development fallback — see
 * fallback/MockMapFallback.tsx) when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY isn't
 * configured, or if the script genuinely fails to load. Never silently
 * shows a blank map or crashes the surrounding page.
 */
export function RideMap({
  className,
  pickup,
  drop,
  driverLocation,
  fallbackVariant = "static",
  fallbackProgress,
  driverLocationStale,
  routePolyline,
}: RideMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const pickupMarkerRef = React.useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const dropMarkerRef = React.useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const driverMarkerRef = React.useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const polylineRef = React.useRef<google.maps.Polyline | null>(null);

  const [loadState, setLoadState] = React.useState<LoadState>(isGoogleMapsConfigured() ? "loading" : "idle");

  // Load the script + create the map instance once.
  React.useEffect(() => {
    if (!isGoogleMapsConfigured()) return;
    let cancelled = false;

    loadGoogleMaps()
      .then(async (g) => {
        if (cancelled || !containerRef.current) return;
        const { Map } = (await g.maps.importLibrary("maps")) as google.maps.MapsLibrary;
        mapRef.current = new Map(containerRef.current, {
          center: pickup ?? DEFAULT_CITY_CENTER,
          zoom: 14,
          disableDefaultUI: true,
          zoomControl: true,
          // A Map ID is required for AdvancedMarkerElement (the current
          // recommended marker API). "DEMO_MAP_ID" is Google's own
          // publicly-documented placeholder for local development —
          // production deployments should create a real Map ID in Google
          // Cloud Console. Documented in .env.example.
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
        });
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep markers in sync with props, without recreating the map itself.
  React.useEffect(() => {
    if (loadState !== "ready" || !mapRef.current) return;
    const g = google;
    const map = mapRef.current;
    const bounds = new g.maps.LatLngBounds();
    let hasPoint = false;

    async function syncMarkers() {
      const { AdvancedMarkerElement, PinElement } = (await g.maps.importLibrary(
        "marker"
      )) as google.maps.MarkerLibrary;

      if (pickup) {
        if (!pickupMarkerRef.current) {
          pickupMarkerRef.current = new AdvancedMarkerElement({
            map,
            content: new PinElement({ background: "#1C9B6B", borderColor: "#ffffff", glyphColor: "#ffffff" }).element,
          });
        }
        pickupMarkerRef.current.position = pickup;
        bounds.extend(pickup);
        hasPoint = true;
      }

      if (drop) {
        if (!dropMarkerRef.current) {
          dropMarkerRef.current = new AdvancedMarkerElement({
            map,
            content: new PinElement({ background: "#D6493B", borderColor: "#ffffff", glyphColor: "#ffffff" }).element,
          });
        }
        dropMarkerRef.current.position = drop;
        bounds.extend(drop);
        hasPoint = true;
      }

      if (driverLocation) {
        if (!driverMarkerRef.current) {
          const el = new PinElement({ background: "#1E6FEF", borderColor: "#ffffff", glyphColor: "#ffffff", scale: 0.95 }).element;
          driverMarkerRef.current = new AdvancedMarkerElement({ map, content: el });
        }
        driverMarkerRef.current.position = driverLocation;
        if (driverMarkerRef.current.content instanceof HTMLElement) {
          driverMarkerRef.current.content.style.opacity = driverLocationStale ? "0.5" : "1";
        }
        bounds.extend(driverLocation);
        hasPoint = true;
      } else if (driverMarkerRef.current) {
        driverMarkerRef.current.map = null;
        driverMarkerRef.current = null;
      }

      // Route polyline — drawn beneath the markers (Polyline has no
      // z-index concept relative to AdvancedMarkerElement, but markers
      // are added to the map after this in DOM/paint order via their own
      // effect calls above, which is enough). Re-set the whole path on
      // every change rather than diffing — a route polyline is replaced
      // wholesale when it changes (a new destination = a new route), never
      // incrementally edited.
      if (routePolyline && routePolyline.length > 1) {
        if (!polylineRef.current) {
          polylineRef.current = new g.maps.Polyline({
            map,
            strokeColor: "#1E6FEF",
            strokeOpacity: 0.9,
            strokeWeight: 5,
          });
        }
        polylineRef.current.setPath(routePolyline);
        for (const point of routePolyline) bounds.extend(point);
        hasPoint = true;
      } else if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }

      if (hasPoint) map.fitBounds(bounds, 60);
    }

    syncMarkers();
  }, [loadState, pickup, drop, driverLocation, driverLocationStale, routePolyline]);

  // Polyline cleanup on unmount — mirrors the geolocation watcher's own
  // explicit cleanup requirement; a Polyline left attached to a map that
  // no longer renders this component would otherwise leak.
  React.useEffect(() => {
    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, []);

  if (!isGoogleMapsConfigured() || loadState === "error") {
    return <MockMap variant={fallbackVariant} progress={fallbackProgress} className={className} />;
  }

  return (
    <div className={cn("relative w-full overflow-hidden rounded-lg border border-border bg-ink/5", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {loadState === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-paper/60 text-xs text-ink-soft">
          Loading map…
        </div>
      )}
    </div>
  );
}
