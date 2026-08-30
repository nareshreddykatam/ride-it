"use client";

import * as React from "react";
import { Map as MaplibreMap, Marker, NavigationControl, LngLatBounds, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, LineString } from "geojson";
import { cn } from "@ride-it/ui";
import type { VehicleKind } from "@ride-it/ui";
import { createVehicleMarkerElement } from "../vehicle-marker";
import type { LatLng } from "./RideMap";

// maplibre-gl needs a one-time setWorkerUrl() call under webpack/Next.js —
// import.meta.url (which the package normally uses to locate its own
// worker script) doesn't resolve correctly once webpack has bundled it,
// so without this the Map silently never fires "load" and never requests
// a single tile (verified live: the worker's module script 404s as HTML,
// caught via console — no network request to the tile host is ever made,
// no error event fires either). /public/maplibre/*.mjs in each consuming
// app is a committed copy of maplibre-gl's own dist/maplibre-gl-worker.mjs
// + maplibre-gl-shared.mjs (the worker imports its sibling by relative
// path, so both must be copied together) — re-copy them from
// node_modules/maplibre-gl/dist/ if the maplibre-gl version here is ever
// bumped. Called at module scope so it runs exactly once, before the
// first Map is ever constructed.
if (typeof window !== "undefined") {
  setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
}

// OpenFreeMap (openfreemap.org) — free, no API key, no request limits,
// commercial use explicitly permitted (see the map-ecosystem audit report
// for the verified terms). "positron" is a clean light basemap (CARTO
// Positron-alike), chosen over the darker "liberty"/"dark" styles because
// the rest of this product's surfaces are light-first and markers need to
// read clearly against it — not a decorative choice.
const OFM_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

// Vijayawada, Andhra Pradesh — mirrors RideMap.tsx's own DEFAULT_CITY_CENTER.
const DEFAULT_CITY_CENTER: LatLng = { lat: 16.5062, lng: 80.648 };

export interface OsmMapProps {
  className?: string;
  pickup?: LatLng;
  drop?: LatLng;
  driverLocation?: LatLng | null;
  driverLocationStale?: boolean;
  routePolyline?: LatLng[];
  vehicleType?: VehicleKind;
  /** Called once if the map tile style itself fails to load (e.g. genuinely offline, or tiles.openfreemap.org unreachable) — the parent (RideMap) falls back to MockMap when this fires, the same honest-degradation contract Google's path already has. */
  onUnavailable: () => void;
}

export function OsmMap({
  className,
  pickup,
  drop,
  driverLocation,
  driverLocationStale,
  routePolyline,
  vehicleType,
  onUnavailable,
}: OsmMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MaplibreMap | null>(null);
  const pickupMarkerRef = React.useRef<Marker | null>(null);
  const dropMarkerRef = React.useRef<Marker | null>(null);
  const driverMarkerRef = React.useRef<Marker | null>(null);
  const [ready, setReady] = React.useState(false);
  const [locating, setLocating] = React.useState(false);

  // Create the map instance once.
  React.useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const map = new MaplibreMap({
      container: containerRef.current,
      style: OFM_STYLE_URL,
      center: [pickup?.lng ?? DEFAULT_CITY_CENTER.lng, pickup?.lat ?? DEFAULT_CITY_CENTER.lat],
      zoom: 13,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      if (!cancelled) setReady(true);
    });
    map.on("error", () => {
      if (!cancelled) onUnavailable();
    });

    // The container can genuinely measure 0×N at the instant maplibre-gl's
    // constructor reads its size — this component mounts inside a
    // React.lazy/Suspense boundary (see RideMap.tsx), and the container's
    // real width isn't always committed to layout in the same tick the
    // lazy chunk finishes executing. maplibre-gl caches whatever size it
    // read at construction time and never re-checks on its own, so a 0px
    // width there means it silently never requests tiles or fires "load"
    // — not a network/style/CSP problem, purely a "measured too early"
    // one. A ResizeObserver telling it to (re-)measure once its container
    // actually has real dimensions is the standard fix for this exact
    // failure mode, and also correctly handles later real resizes
    // (orientation change, layout changes) that a one-shot fix wouldn't.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    mapRef.current = map;
    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep markers/route in sync with props, without recreating the map.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const bounds = new LngLatBounds();
    let hasPoint = false;

    if (pickup) {
      if (!pickupMarkerRef.current) {
        // setLngLat() before addTo() — addTo() immediately positions the
        // marker against the map, and maplibre-gl throws reading the
        // marker's (still-unset) lngLat if that happens first.
        pickupMarkerRef.current = new Marker({ color: "#1C9B6B" }).setLngLat([pickup.lng, pickup.lat]).addTo(map);
      } else {
        pickupMarkerRef.current.setLngLat([pickup.lng, pickup.lat]);
      }
      bounds.extend([pickup.lng, pickup.lat]);
      hasPoint = true;
    }

    if (drop) {
      if (!dropMarkerRef.current) {
        dropMarkerRef.current = new Marker({ color: "#D6493B" }).setLngLat([drop.lng, drop.lat]).addTo(map);
      } else {
        dropMarkerRef.current.setLngLat([drop.lng, drop.lat]);
      }
      bounds.extend([drop.lng, drop.lat]);
      hasPoint = true;
    }

    if (driverLocation) {
      if (!driverMarkerRef.current) {
        const el = createVehicleMarkerElement(vehicleType, driverLocationStale);
        driverMarkerRef.current = new Marker({ element: el }).setLngLat([driverLocation.lng, driverLocation.lat]).addTo(map);
      } else {
        driverMarkerRef.current.getElement().style.opacity = driverLocationStale ? "0.55" : "1";
        driverMarkerRef.current.setLngLat([driverLocation.lng, driverLocation.lat]);
      }
      bounds.extend([driverLocation.lng, driverLocation.lat]);
      hasPoint = true;
    } else if (driverMarkerRef.current) {
      driverMarkerRef.current.remove();
      driverMarkerRef.current = null;
    }

    if (routePolyline && routePolyline.length > 1) {
      const geojson: Feature<LineString> = {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: routePolyline.map((p) => [p.lng, p.lat]) },
      };
      const source = map.getSource("route-polyline") as GeoJSONSource | undefined;
      if (source) {
        source.setData(geojson);
      } else {
        map.addSource("route-polyline", { type: "geojson", data: geojson });
        map.addLayer({
          id: "route-polyline-line",
          type: "line",
          source: "route-polyline",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#1E6FEF", "line-width": 4.5, "line-opacity": 0.9 },
        });
      }
      for (const p of routePolyline) bounds.extend([p.lng, p.lat]);
      hasPoint = true;
    } else if (map.getLayer("route-polyline-line")) {
      map.removeLayer("route-polyline-line");
      map.removeSource("route-polyline");
    }

    if (hasPoint) map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 400 });
  }, [ready, pickup, drop, driverLocation, driverLocationStale, routePolyline, vehicleType]);

  async function handleLocate() {
    const map = mapRef.current;
    if (!map || typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15, duration: 600 });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 5000 }
    );
  }

  return (
    <div className={cn("relative w-full overflow-hidden rounded-lg border border-border bg-ink/5", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-paper/60 text-xs text-ink-soft">Loading map…</div>
      )}
      <button
        type="button"
        onClick={handleLocate}
        disabled={locating}
        aria-label="Use my current location"
        className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-md transition-transform active:scale-95 disabled:opacity-60"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
