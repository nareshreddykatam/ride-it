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

/**
 * True once a maplibre-gl Map instance has actually finished constructing
 * a WebGL2 painter — false for an instance that never will. Root cause
 * (verified by reading maplibre-gl 6.6.0's own source,
 * node_modules/maplibre-gl/dist/maplibre-gl-dev.mjs): the Map constructor
 * calls `_setupPainter()` synchronously, which does
 * `canvas.getContext("webgl2")` and, if that fails — WebGL2 unavailable,
 * blocked, or (empirically reproduced while testing this fix, by
 * navigating away/back enough times in a row) the browser's own WebGL
 * context-count limit kicking in and refusing new contexts — fires a
 * GPUInitializationError "error" event and returns WITHOUT ever assigning
 * `this.painter`. The outer constructor then ALSO returns early right
 * after, leaving the instance permanently, not just momentarily,
 * partially constructed: `painter` never becomes defined later, no
 * amount of waiting/retrying fixes it.
 *
 * Two real, unrelated call paths in this component dereference `painter`
 * on whatever `mapRef.current` currently holds, and both throw exactly
 * "Cannot read properties of undefined" on such an instance:
 *   - `Map.prototype.remove()` starts with `this.painter.destroy()`.
 *   - `Map.prototype.resize()` (called by this component's own
 *     ResizeObserver any time the container's size changes, for as long
 *     as the component stays mounted — not only during cleanup) calls
 *     `this.painter.resize(...)` via `_resizeInternal()`.
 * Both are guarded by this same check rather than duplicating it, since
 * both are the same underlying condition.
 *
 * `painter` isn't part of maplibre-gl's public TypeScript surface (hence
 * the cast), but it's the literal property both methods dereference —
 * this checks the exact real precondition, not a general internals probe.
 */
function hasPainter(map: MaplibreMap): boolean {
  return !!(map as unknown as { painter?: unknown }).painter;
}

/**
 * Removes a maplibre-gl Map instance only if it's actually safe to — never
 * a bare `map.remove()`. Skips instances that never got a painter (see
 * hasPainter() above) — such an instance never allocated a WebGL context,
 * tiles, or workers either, so there is nothing expensive left to
 * release; dropping the caller's only reference is enough for normal GC.
 * Also skips an instance already removed (`_removed`, set by
 * maplibre-gl's own `remove()` on success) so a second call — e.g. if
 * this cleanup function were ever somehow invoked more than once — is a
 * safe no-op instead of operating on an already-torn-down instance.
 */
function safelyRemoveMap(map: MaplibreMap): void {
  const internals = map as unknown as { _removed?: boolean };
  if (hasPainter(map) && !internals._removed) {
    map.remove();
  }
}

function roundCoord(n: number): number {
  // ~1.1m precision — tighter than GPS accuracy, so this never masks a
  // real movement, only genuinely-identical repeated poll results.
  return Math.round(n * 1e5) / 1e5;
}

/**
 * A cheap signature of "what fitBounds() would be fed", used to skip the
 * animated camera re-fit when a re-render was triggered by a fresh object
 * identity (e.g. a poll-driven refetch) carrying the exact same
 * coordinates as last time. Shared with RideMap.tsx's GoogleRideMap path,
 * which has the identical marker-sync-without-recreating-the-map shape.
 */
function fitBoundsSignature(
  pickup: LatLng | undefined,
  drop: LatLng | undefined,
  driverLocation: LatLng | null | undefined,
  routePolyline: LatLng[] | undefined
): string {
  const first = routePolyline && routePolyline.length > 1 ? routePolyline[0] : undefined;
  const last = routePolyline && routePolyline.length > 1 ? routePolyline[routePolyline.length - 1] : undefined;
  return [
    pickup ? `p${roundCoord(pickup.lat)},${roundCoord(pickup.lng)}` : "",
    drop ? `d${roundCoord(drop.lat)},${roundCoord(drop.lng)}` : "",
    driverLocation ? `v${roundCoord(driverLocation.lat)},${roundCoord(driverLocation.lng)}` : "",
    first && last
      ? `r${routePolyline!.length}:${roundCoord(first.lat)},${roundCoord(first.lng)}-${roundCoord(last.lat)},${roundCoord(last.lng)}`
      : "",
  ].join("|");
}

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
  // Signature of the last coordinates actually passed to fitBounds() — see
  // the effect below. Callers like the Ride screen re-fetch tracking data
  // on a poll interval, which hands this component a brand-new {lat, lng}
  // object identity every tick even when the underlying position is
  // numerically unchanged; without this guard that would re-trigger a full
  // animated camera re-fit every poll, fighting any manual pan/zoom the
  // rider is doing. Rounded to 5 decimal places (~1.1m) — comfortably
  // tighter than GPS accuracy, so this never masks a real movement.
  const lastFitSignatureRef = React.useRef<string | null>(null);
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

    // _setupPainter() (see hasPainter()'s doc comment) runs synchronously
    // inside the constructor above and fires its own GPUInitializationError
    // "error" event immediately, on this same `map` — before this effect
    // has had any chance to call map.on("error", ...) below. maplibre-gl's
    // Evented class doesn't queue/replay events fired with zero listeners,
    // so that specific event is simply lost: not a crash (hasPainter()
    // already keeps every later operation safe on such an instance), but
    // onUnavailable() would never fire either, leaving RideMap stuck
    // rendering this OsmMap's own "Loading map…" state forever instead of
    // falling back to MockMap. hasPainter() is already true-or-false by
    // the time the constructor above returns (painter setup doesn't
    // straddle this line), so checking it here catches exactly that one
    // synchronous failure — the map.on("error", ...) listener below is
    // untouched and still the correct way to catch every later, genuinely
    // asynchronous failure (style/tile fetch, etc.).
    if (!hasPainter(map)) {
      onUnavailable();
      return;
    }

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
    // Guarded by hasPainter() for the same reason cleanup is (see its doc
    // comment above) — this callback can keep firing for as long as the
    // component stays mounted, on a `map` that may have failed to get a
    // WebGL2 context at construction time.
    const resizeObserver = new ResizeObserver(() => {
      if (hasPainter(map)) map.resize();
    });
    resizeObserver.observe(containerRef.current);

    mapRef.current = map;
    return () => {
      cancelled = true;
      // A plain Web API, always safe regardless of the map's own state.
      resizeObserver.disconnect();

      // Only clear the ref if it's still pointing at THIS effect's own
      // map instance — under React Strict Mode's dev-only double
      // mount/unmount/remount, this cleanup always runs before the next
      // effect's setup (React guarantees that ordering), so in practice
      // mapRef.current is always still `map` here; the check is cheap
      // extra safety against ever nulling out a newer instance's ref.
      if (mapRef.current === map) {
        mapRef.current = null;
      }

      safelyRemoveMap(map);
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

    if (hasPoint) {
      const signature = fitBoundsSignature(pickup, drop, driverLocation, routePolyline);
      if (signature !== lastFitSignatureRef.current) {
        lastFitSignatureRef.current = signature;
        map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 400 });
      }
    }
  }, [ready, pickup, drop, driverLocation, driverLocationStale, routePolyline, vehicleType]);

  async function handleLocate() {
    const map = mapRef.current;
    // Same hasPainter() guard as the effect above — this button is always
    // rendered regardless of `ready`, so it's reachable even on a map that
    // failed to get a WebGL2 context.
    if (!map || !hasPainter(map) || typeof navigator === "undefined" || !navigator.geolocation) return;
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
