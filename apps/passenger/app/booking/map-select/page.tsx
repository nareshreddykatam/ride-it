"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, MapPin } from "lucide-react";
import { Button, PinGlyph } from "@ride-it/ui";
import { RideMap, getCurrentPositionOnce, fetchReverseGeocode, type LatLng } from "@ride-it/maps";

type Mode = "pickup" | "destination";

const DEFAULT_CITY_CENTER: LatLng = { lat: 16.5062, lng: 80.648 };

/**
 * Shared exact-point map pin-selection screen — used for BOTH "Select
 * pickup on map" (from booking/confirm's Edit-pickup sheet) and "Choose
 * destination on map" (from the destination search screen). One
 * implementation, not two, per the explicit "do not duplicate" instruction
 * — only `mode` and the pin color/copy differ.
 *
 * State is carried entirely via URL params, matching this app's existing
 * booking/search/confirm architecture (no new global store): `return` is
 * the calling screen's own full query string (URL-encoded), preserved
 * byte-for-byte except for the pickup/destination keys this screen
 * actually changes — so nothing else the passenger already chose
 * (vehicle type, fare estimate, route polyline, ...) is lost.
 */
function MapSelectPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const mode: Mode = params.get("mode") === "pickup" ? "pickup" : "destination";
  const returnQuery = params.get("return") ?? "";
  const returnParams = React.useMemo(() => new URLSearchParams(returnQuery), [returnQuery]);

  const [initialCenter, setInitialCenter] = React.useState<LatLng | null>(null);
  const [selected, setSelected] = React.useState<LatLng | null>(null);
  const [address, setAddress] = React.useState<string | null>(null);
  const [resolvingAddress, setResolvingAddress] = React.useState(false);
  const [mapUnavailable, setMapUnavailable] = React.useState(false);
  const requestIdRef = React.useRef(0);

  // Resolve where to first center the map: an already-selected coordinate
  // for this same role (editing a prior choice) takes priority, then a
  // fresh GPS read, then the city default — never blocks indefinitely if
  // GPS is denied/unavailable (Part 11).
  React.useEffect(() => {
    let active = true;
    (async () => {
      const existingLat = mode === "pickup" ? returnParams.get("pickupLat") : returnParams.get("destLat");
      const existingLng = mode === "pickup" ? returnParams.get("pickupLng") : returnParams.get("destLng");
      if (existingLat && existingLng) {
        if (active) setInitialCenter({ lat: Number(existingLat), lng: Number(existingLng) });
        return;
      }
      const pos = await getCurrentPositionOnce();
      if (!active) return;
      setInitialCenter(pos ?? DEFAULT_CITY_CENTER);
    })();
    return () => {
      active = false;
    };
    // Only resolved once, on mount — re-centering later would fight the
    // passenger's own pan gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reverse-geocodes the settled center. Called only from RideMap's
  // onSelectionIdle (already debounced to real pan/zoom settle points by
  // the map backend itself — see RideMap.tsx/OsmMap.tsx — never per
  // frame). requestId guards against an in-flight lookup for an earlier
  // position resolving after a newer one, which would otherwise flash a
  // stale address.
  const handleSelectionIdle = React.useCallback(async (center: LatLng) => {
    setSelected(center);
    setResolvingAddress(true);
    const requestId = ++requestIdRef.current;
    const result = await fetchReverseGeocode(center.lat, center.lng);
    if (requestIdRef.current !== requestId) return; // superseded by a later move
    setResolvingAddress(false);
    // Failure keeps the exact coordinates and shows an honest fallback
    // label — never discards the selection because a lookup failed (Part 12).
    setAddress(result?.formattedAddress ?? "Selected location");
  }, []);

  function handleConfirm() {
    if (!selected) return;
    const next = new URLSearchParams(returnParams);
    const label = address ?? "Selected location";
    if (mode === "pickup") {
      next.set("pickupLat", String(selected.lat));
      next.set("pickupLng", String(selected.lng));
      next.set("pickupAddress", label);
      router.push(`/booking/confirm?${next.toString()}`);
    } else {
      next.set("destination", label);
      next.set("destLat", String(selected.lat));
      next.set("destLng", String(selected.lng));
      // A newly map-picked destination invalidates any route geometry
      // fetched for the OLD destination — never carry a stale polyline
      // forward for a different endpoint.
      next.delete("routePolyline");
      router.push(`/booking?${next.toString()}`);
    }
  }

  const tone: "pickup" | "drop" = mode === "pickup" ? "pickup" : "drop";
  const title = mode === "pickup" ? "Select pickup on map" : "Choose destination on map";

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-paper">
      {/* Full-bleed map layer — position:absolute against this <main>'s own
          relative positioning context, not a flex-1 percentage-height
          child. A plain "flex-1 child with h-full" chain here collapses to
          a near-zero rendered height once RideMap's own Suspense/lazy
          OsmMap boundary settles (verified live: the container measured
          1.6px tall post-settle despite its flex parent correctly being
          ~500px, silently clipping the whole map via overflow-hidden) —
          the same absolute-overlay composition already proven on
          ride/[id]/page.tsx and booking/matching/page.tsx's MatchingRadar
          sidesteps that percentage-height chain entirely. */}
      <div className="absolute inset-0">
        {initialCenter && (
          <RideMap
            className="h-full w-full rounded-none border-0"
            selectionMode
            selectionTone={tone}
            selectionInitialCenter={initialCenter}
            onSelectionIdle={handleSelectionIdle}
            onSelectionUnavailable={() => setMapUnavailable(true)}
          />
        )}
      </div>

      <div className="relative z-10 flex items-center gap-3 bg-paper/95 px-5 pt-4 pb-2 backdrop-blur-md">
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-sm transition-transform active:scale-95"
        >
          <ArrowRight size={18} className="rotate-180 text-ink" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-bold text-ink">{title}</h1>
          <p className="text-xs text-ink-soft">Move the map to place the pin exactly where you mean</p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="relative z-10 mt-auto shrink-0 border-t border-border bg-surface/95 px-5 py-4 shadow-sheet backdrop-blur-md"
      >
        {mapUnavailable ? (
          <Button className="w-full h-12" variant="outline" onClick={() => router.back()}>
            Go back and search instead
          </Button>
        ) : (
          <>
            <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                <PinGlyph tone={tone} size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                  {mode === "pickup" ? "Pickup Point" : "Destination"}
                </p>
                <p className="truncate text-sm font-semibold text-ink">
                  {resolvingAddress ? "Finding address…" : (address ?? (selected ? "Selected location" : "Move the map to select"))}
                </p>
              </div>
              <MapPin size={16} className="mt-1 shrink-0 text-ink-soft" aria-hidden="true" />
            </div>
            <Button className="w-full h-12 text-base font-display font-bold" disabled={!selected} onClick={handleConfirm}>
              Confirm {mode === "pickup" ? "pickup" : "destination"}
            </Button>
          </>
        )}
      </motion.div>
    </main>
  );
}

export default function MapSelectPage() {
  return (
    <Suspense fallback={null}>
      <MapSelectPageContent />
    </Suspense>
  );
}
