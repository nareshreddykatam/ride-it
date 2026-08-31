"use client";

import * as React from "react";
import { cn } from "@ride-it/ui";
import type { VehicleKind } from "@ride-it/ui";
import { isGoogleMapsConfigured } from "../env";
import { loadGoogleMaps } from "../loader";
import { createVehicleMarkerElement } from "../vehicle-marker";
import { MockMap, type MockMapProps } from "../fallback/MockMapFallback";
import { SelectionPinOverlay } from "./SelectionPinOverlay";

// Lazily loaded — maplibre-gl is a genuinely sizeable bundle (~250KB), and
// most call sites never need it at all (Google's path, when configured,
// never touches this code path). React.lazy keeps it out of every route's
// initial JS and fetches it only the first time a RideMap actually
// resolves to the OSM tier, matching Phase 9's "don't load what isn't
// needed" instruction.
const OsmMap = React.lazy(() => import("./OsmMap").then((m) => ({ default: m.OsmMap })));

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
  /** The ride's actual vehicle type (auto/bike/scooty/car) — when provided, the driver marker renders that vehicle's real silhouette (@ride-it/ui's VEHICLE_VISUALS) instead of a plain dot. Omit for a driver's own self-location marker, where "which vehicle" isn't meaningful. */
  vehicleType?: VehicleKind;
  /**
   * Exact-point pin-selection mode (booking/map-select) — renders a pin
   * fixed to the container's visual center (not a real map marker, so it
   * stays glued to center as the passenger pans the map underneath it)
   * instead of the normal pickup/drop markers. The selected coordinate is
   * always exactly what the pin visually points at — this is what makes
   * "the visual pin and submitted coordinates must be the same location"
   * true by construction, not by convention.
   */
  selectionMode?: boolean;
  /** Pin color while in selectionMode — "pickup" (green) or "drop" (red), same PinTone vocabulary as PinGlyph/RideMap's own markers elsewhere. */
  selectionTone?: "pickup" | "drop";
  /** Where to center the map on first mount when selectionMode is active — construction-time only (panning afterward never fights the passenger's own gesture), mirrors the existing pickup-as-initial-center behavior when omitted. */
  selectionInitialCenter?: LatLng;
  /** Fires once panning/zooming settles (debounced by the underlying map's own "idle"/"moveend" event, never per-frame) with the coordinate now under the fixed center pin — see Part 13's "move map, wait until movement stops, resolve once" requirement. Also fires once immediately when the map becomes ready, so an address preview is available before the passenger even touches the map. */
  onSelectionIdle?: (center: LatLng) => void;
  /**
   * Fires once if selectionMode is requested but the map has fallen all
   * the way to the MockMap fallback (no real WebGL map available) — a
   * decorative SVG has no real-world coordinate space, so exact-point
   * selection is architecturally impossible there. Callers must show an
   * honest unavailable state instead of a fake movable pin; RideMap
   * itself already does this for its own default rendering (Part 10).
   */
  onSelectionUnavailable?: () => void;
}


// Vijayawada, Andhra Pradesh — the operating/demo city (Part 15). Used only
// as the initial map center before pickup/drop are known; every other
// coordinate on the map comes from real props.
const DEFAULT_CITY_CENTER: LatLng = { lat: 16.5062, lng: 80.648 };

type LoadState = "idle" | "loading" | "ready" | "error";

function roundCoord(n: number): number {
  // ~1.1m precision — tighter than GPS accuracy, so this never masks a
  // real movement, only genuinely-identical repeated poll results.
  return Math.round(n * 1e5) / 1e5;
}

/**
 * Signature of "what fitBounds() would be fed" — lets the marker-sync
 * effect below skip the animated camera re-fit when a re-render was
 * triggered by a fresh object identity (e.g. a caller's poll-driven
 * refetch, such as the Ride screen's 10s tracking reconciliation) carrying
 * the exact same coordinates as last time, rather than a real movement.
 * Deliberately NOT imported from OsmMap.tsx's identical helper — OsmMap is
 * React.lazy-loaded specifically to keep the maplibre-gl bundle out of
 * every route's initial JS (see the import above), and a static import
 * from it here would defeat that.
 */
function googleFitBoundsSignature(
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

/**
 * Three-tier map backend, chosen at render time, not configurable per call
 * site — see the map-ecosystem audit report for the full reasoning:
 *
 *   1. Google Maps JS API — used only if NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is
 *      genuinely configured. Untouched by this change other than the
 *      driver marker now using the real vehicle silhouette instead of a
 *      generic pin.
 *   2. OsmMap (MapLibre GL + OpenFreeMap, see ./OsmMap.tsx) — the new
 *      default when Google isn't configured. Free, no API key, verified
 *      commercially usable, renders REAL streets/geography instead of the
 *      decorative mock — this is the actual fix for "no Maps key
 *      configured" no longer meaning "fake map."
 *   3. MockMap — last-resort fallback, only if OsmMap itself reports its
 *      tile style failed to load (e.g. genuinely offline). Unchanged.
 *
 * Never silently shows a blank map or crashes the surrounding page.
 */
export function RideMap(props: RideMapProps) {
  const [osmFailed, setOsmFailed] = React.useState(false);

  if (isGoogleMapsConfigured()) {
    return <GoogleRideMap {...props} />;
  }

  if (!osmFailed) {
    return (
      <React.Suspense
        fallback={
          <div className={cn("relative w-full overflow-hidden rounded-lg border border-border bg-ink/5", props.className)}>
            <div className="absolute inset-0 flex items-center justify-center bg-paper/60 text-xs text-ink-soft">Loading map…</div>
          </div>
        }
      >
        <OsmMap
          className={props.className}
          pickup={props.pickup}
          drop={props.drop}
          driverLocation={props.driverLocation}
          driverLocationStale={props.driverLocationStale}
          routePolyline={props.routePolyline}
          vehicleType={props.vehicleType}
          selectionMode={props.selectionMode}
          selectionTone={props.selectionTone}
          selectionInitialCenter={props.selectionInitialCenter}
          onSelectionIdle={props.onSelectionIdle}
          onUnavailable={() => setOsmFailed(true)}
        />
      </React.Suspense>
    );
  }

  // Genuine last resort: a decorative SVG with no real-world coordinate
  // space. Exact-point selection is architecturally impossible here — per
  // Part 10, this must say so honestly rather than render a fake movable
  // pin that would silently submit meaningless coordinates.
  if (props.selectionMode) {
    return <SelectionUnavailableFallback className={props.className} onUnavailable={props.onSelectionUnavailable} />;
  }

  return <MockMap variant={props.fallbackVariant ?? "static"} progress={props.fallbackProgress} className={props.className} />;
}

function SelectionUnavailableFallback({ className, onUnavailable }: { className?: string; onUnavailable?: () => void }) {
  React.useEffect(() => {
    onUnavailable?.();
    // Fire exactly once when this fallback actually mounts — not on every
    // parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={cn(
        "relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-border bg-ink/5 p-6 text-center",
        className
      )}
    >
      <p className="text-sm font-medium text-ink">Map selection isn&apos;t available right now</p>
      <p className="text-xs text-ink-soft">Please search for the location instead.</p>
    </div>
  );
}

/** The Google Maps JS API backend — used only when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is genuinely configured. Falls back to MockMap if the script itself fails to load (network/key error), same as before this change. */
function GoogleRideMap({
  className,
  pickup,
  drop,
  driverLocation,
  fallbackVariant = "static",
  fallbackProgress,
  driverLocationStale,
  routePolyline,
  vehicleType,
  selectionMode,
  selectionTone = "pickup",
  selectionInitialCenter,
  onSelectionIdle,
}: RideMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const pickupMarkerRef = React.useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const dropMarkerRef = React.useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const driverMarkerRef = React.useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const polylineRef = React.useRef<google.maps.Polyline | null>(null);
  // Same reasoning as OsmMap's identical guard: avoids re-triggering
  // fitBounds on every poll-driven refetch when coordinates haven't
  // actually changed, just been handed a new object identity.
  const lastFitSignatureRef = React.useRef<string | null>(null);
  // Latest onSelectionIdle — read from a ref inside the map's own "idle"
  // listener (registered once, at map-creation time) so a caller passing
  // a fresh function identity every render never needs to tear down and
  // re-register the listener.
  const onSelectionIdleRef = React.useRef(onSelectionIdle);
  onSelectionIdleRef.current = onSelectionIdle;

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
          center: selectionMode ? (selectionInitialCenter ?? pickup ?? DEFAULT_CITY_CENTER) : (pickup ?? DEFAULT_CITY_CENTER),
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

        if (selectionMode) {
          // "idle" fires once panning/zooming settles — never per-frame —
          // exactly the "move map, wait until movement stops, resolve
          // once" pattern Part 13 requires. Registered once here (not in
          // the marker-sync effect below, which this mode skips entirely)
          // and reads the latest callback via a ref so a fresh function
          // identity per render never needs a listener teardown/re-add.
          mapRef.current.addListener("idle", () => {
            const center = mapRef.current?.getCenter();
            if (center) onSelectionIdleRef.current?.({ lat: center.lat(), lng: center.lng() });
          });
        }

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
  // Selection mode uses the always-centered CSS pin overlay instead (see
  // SelectionPinOverlay) and deliberately never calls fitBounds() here —
  // doing so would fight the passenger's own pan gesture, recentering the
  // map out from under them mid-drag.
  React.useEffect(() => {
    if (loadState !== "ready" || !mapRef.current || selectionMode) return;
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
          // Real vehicle silhouette (auto/bike/scooty/car), not a generic
          // pin — see ../vehicle-marker.tsx. Shared with OsmMap's driver
          // marker so both backends render the exact same badge.
          const el = createVehicleMarkerElement(vehicleType, driverLocationStale);
          driverMarkerRef.current = new AdvancedMarkerElement({ map, content: el });
        }
        driverMarkerRef.current.position = driverLocation;
        if (driverMarkerRef.current.content instanceof HTMLElement) {
          driverMarkerRef.current.content.style.opacity = driverLocationStale ? "0.55" : "1";
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

      if (hasPoint) {
        const signature = googleFitBoundsSignature(pickup, drop, driverLocation, routePolyline);
        if (signature !== lastFitSignatureRef.current) {
          lastFitSignatureRef.current = signature;
          map.fitBounds(bounds, 60);
        }
      }
    }

    syncMarkers();
  }, [loadState, pickup, drop, driverLocation, driverLocationStale, routePolyline, vehicleType, selectionMode]);

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

  // GoogleRideMap is only ever rendered by RideMap once isGoogleMapsConfigured()
  // is already known true — the only failure mode left to handle here is the
  // script itself failing to load (network/key error), same as before.
  if (loadState === "error") {
    if (selectionMode) {
      return <SelectionUnavailableFallback className={className} />;
    }
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
      {selectionMode && loadState === "ready" && <SelectionPinOverlay tone={selectionTone} />}
    </div>
  );
}
