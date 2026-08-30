"use client";

import { createRoot } from "react-dom/client";
import { VEHICLE_VISUALS, type VehicleKind } from "@ride-it/ui";

/**
 * Builds a plain HTMLElement showing the ride's actual vehicle silhouette
 * (auto/bike/scooty/car — @ride-it/ui's existing VEHICLE_VISUALS, not a
 * new icon set) in a colored circle badge, matching that vehicle's own
 * identity color. Used as marker content for BOTH map backends —
 * google.maps.marker.AdvancedMarkerElement's `content` option and
 * maplibre-gl's `Marker({ element })` both just want an HTMLElement, so one
 * builder serves both instead of duplicating the same badge twice.
 *
 * Falls back to a plain colored dot (no icon) when vehicleType is unknown
 * — e.g. a driver's own self-marker screens, which don't pass one — rather
 * than guessing a vehicle. Never a generic car icon standing in for an
 * unknown type.
 *
 * Staleness (driverLocationStale) is applied by the caller mutating
 * `element.style.opacity` directly after creation, the same convention
 * RideMap's Google path already used for its old PinElement driver marker
 * — this function only sets the *initial* opacity, so callers don't need
 * to re-render React just to dim a marker.
 */
export function createVehicleMarkerElement(vehicleType: VehicleKind | undefined | null, stale?: boolean): HTMLElement {
  const visual = vehicleType ? VEHICLE_VISUALS[vehicleType] : null;

  const el = document.createElement("div");
  el.style.width = "34px";
  el.style.height = "34px";
  el.style.borderRadius = "9999px";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.background = visual ? visual.colorVar : "#1E6FEF";
  el.style.border = "2px solid #ffffff";
  el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.35)";
  el.style.opacity = stale ? "0.55" : "1";

  if (visual) {
    const Icon = visual.icon;
    createRoot(el).render(<Icon size={18} style={{ color: "#ffffff" }} />);
  } else {
    // No vehicle type known — a smaller inner dot reads as "live position",
    // distinct from a full vehicle badge so it's never mistaken for one.
    const dot = document.createElement("div");
    dot.style.width = "10px";
    dot.style.height = "10px";
    dot.style.borderRadius = "9999px";
    dot.style.background = "#ffffff";
    el.appendChild(dot);
  }

  return el;
}
