"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { RefreshCw, Route, Clock3, Pencil, X, Navigation, Search, Map as MapIcon } from "lucide-react";
import { Button, MeterValue, Skeleton, PinGlyph, VEHICLE_VISUALS, BottomSheet } from "@ride-it/ui";
import { VehicleType, vehicleTypeToDb, VEHICLE_TYPE_LABELS_DB } from "@ride-it/types";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { createRide, startMatching, getFareQuote, type FareQuote } from "@ride-it/data";
import { RideMap, getCurrentPositionOnce, fetchGeocode, fetchEta, decodePolyline, type LatLng } from "@ride-it/maps";

// Fallback ONLY when real geolocation/geocoding is unavailable (permission
// denied, no Google API key configured, network failure) — not the
// primary path anymore. Phase 9 replaces the previous hardcoded-always
// demo coordinates with real ones wherever they can be resolved; this
// remains purely as the honest degradation path, matching the same
// pattern used for driver location reporting since Phase 8.
const FALLBACK_PICKUP: LatLng = { lat: 16.5062, lng: 80.648 };
const FALLBACK_DROP: LatLng = { lat: 16.5449, lng: 80.6116 };

const VEHICLE_SUBLABEL: Record<"bike" | "scooty" | "auto" | "car", string> = {
  bike: "Motorcycle",
  scooty: "Scooter",
  auto: "Auto Rickshaw",
  car: "Sedan",
};

function ConfirmBookingPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const destination = params.get("destination") ?? "your destination";
  const vehicleType = (params.get("vehicleType") as VehicleType | null) ?? VehicleType.AUTO;
  const initialUsedRealRoute = params.get("usedRealRoute") === "true";
  const initialDistanceKm = Number(params.get("distanceKm") ?? "0");
  const etaMinutes = params.get("etaMinutes") ?? "5";
  const destLatParam = params.get("destLat");
  const destLngParam = params.get("destLng");
  const knownDrop: LatLng | null = destLatParam && destLngParam ? { lat: Number(destLatParam), lng: Number(destLngParam) } : null;
  const encodedPolyline = params.get("routePolyline");
  const initialRoutePolyline = React.useMemo(() => (encodedPolyline ? decodePolyline(encodedPolyline) : undefined), [encodedPolyline]);
  // A pickup returned from "Search pickup" or "Select pickup on map" (see
  // the Edit-pickup sheet below) — present only when the passenger
  // actually changed pickup away from GPS. Read once; resolveLocations()
  // below honors this instead of re-resolving GPS when present.
  const customPickupLatParam = params.get("pickupLat");
  const customPickupLngParam = params.get("pickupLng");
  const customPickupAddressParam = params.get("pickupAddress");
  const customPickup: LatLng | null =
    customPickupLatParam && customPickupLngParam ? { lat: Number(customPickupLatParam), lng: Number(customPickupLngParam) } : null;

  const [resolvingLocations, setResolvingLocations] = React.useState(true);
  const [pickup, setPickup] = React.useState<LatLng>(FALLBACK_PICKUP);
  const [pickupAddress, setPickupAddress] = React.useState("Current location");
  const [drop, setDrop] = React.useState<LatLng>(knownDrop ?? FALLBACK_DROP);
  const [usedFallback, setUsedFallback] = React.useState(false);
  const [booking, setBooking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editSheetOpen, setEditSheetOpen] = React.useState(false);
  // Live route/distance — seeded from the previous screen's estimate, then
  // recomputed (Part 7) via the same fetchEta() the Booking screen already
  // uses, whenever the real resolved pickup/drop differs from whatever
  // pickup that estimate assumed.
  const [liveDistanceKm, setLiveDistanceKm] = React.useState(initialDistanceKm);
  const [liveRoutePolyline, setLiveRoutePolyline] = React.useState<LatLng[] | undefined>(initialRoutePolyline);
  const [staleRoute, setStaleRoute] = React.useState(false);
  // Whether liveDistanceKm currently reflects a real, calculated route
  // (Google Routes) rather than the Booking screen's honest fallback
  // guess — drives the "estimate is approximate" framing below. Only
  // ever flips false -> true (a successful recompute here always
  // supersedes an earlier fallback); a later failed recompute leaves
  // whatever distance/flag we already have rather than un-flagging a
  // genuinely-real distance as approximate.
  const [usedRealRoute, setUsedRealRoute] = React.useState(initialUsedRealRoute);

  // The server-authoritative pre-ride quote (get_fare_quote(), the exact
  // same calculation compute_ride_fare() applies at ride creation — see
  // packages/data/src/pricing.ts). No client-computed fare exists on this
  // screen at all: `quote` is null until the server responds, and nothing
  // is ever rendered as a fare before that. `quoteRequestId` guards against
  // a race — if the passenger changes pickup/drop/vehicle again before an
  // in-flight quote returns, that stale response is discarded rather than
  // overwriting a newer one (only the response matching the CURRENT
  // request id is ever applied).
  const [quote, setQuote] = React.useState<FareQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = React.useState(true);
  const [quoteError, setQuoteError] = React.useState(false);
  const [quoteRetryNonce, setQuoteRetryNonce] = React.useState(0);
  const quoteRequestIdRef = React.useRef(0);

  const visual = VEHICLE_VISUALS[vehicleTypeToDb(vehicleType)];
  const VehicleIcon = visual.icon;

  // Resolve real coordinates once, on mount — not on every keystroke or
  // re-render. Pickup: a passenger-selected override (search/map — see
  // customPickup above) takes priority; otherwise fresh browser
  // geolocation (deliberately re-resolved here rather than reused from
  // the Booking screen — this is the passenger's actual position at the
  // moment they're about to book, not whatever it was a screen ago).
  // Drop: reuses the coordinate the Search screen already resolved via
  // Places Autocomplete/map selection (knownDrop) when available —
  // server-side geocoding of the destination TEXT is now only a fallback
  // for the cases that never had real coordinates (the dev-only fallback
  // list, or a Places lookup that failed) — previously this always
  // re-geocoded the text, which could silently return different
  // coordinates than whatever the Booking screen's distance/fare estimate
  // was actually computed from.
  const resolveLocations = React.useCallback(async () => {
    setResolvingLocations(true);
    if (customPickup) {
      setPickup(customPickup);
      setPickupAddress(customPickupAddressParam ?? "Selected location");
      setUsedFallback(false);
    } else {
      const position = await getCurrentPositionOnce();
      if (position) {
        setPickup(position);
        setPickupAddress("Current location");
        setUsedFallback(false);
      } else {
        setUsedFallback(true);
      }
    }

    if (knownDrop) {
      setDrop(knownDrop);
    } else {
      const geocoded = await fetchGeocode(destination);
      if (geocoded) setDrop({ lat: geocoded.lat, lng: geocoded.lng });
      else setUsedFallback(true);
    }
    setResolvingLocations(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, destLatParam, destLngParam, customPickupLatParam, customPickupLngParam, customPickupAddressParam]);

  React.useEffect(() => {
    resolveLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Part 7: whenever the REAL resolved pickup (or drop) changes — the
  // initial GPS/override resolution, a "Refresh GPS", or an Edit-pickup
  // action — recompute the real distance via fetchEta(); the quote effect
  // below then re-fetches the server fare for that new distance. fetchEta()
  // already returns null (never throws) if Routes isn't configured/
  // reachable; on that honest failure the last-known-good route is kept
  // as-is rather than reset to zero or silently left claiming a distance
  // that no longer matches the current pickup.
  React.useEffect(() => {
    if (resolvingLocations) return;
    let active = true;
    (async () => {
      const eta = await fetchEta(pickup, drop, vehicleTypeToDb(vehicleType));
      if (!active) return;
      if (eta) {
        setLiveDistanceKm(Math.max(0.1, eta.distanceMeters / 1000));
        if (eta.encodedPolyline) setLiveRoutePolyline(decodePolyline(eta.encodedPolyline));
        setStaleRoute(false);
        setUsedRealRoute(true);
      } else {
        setStaleRoute(true);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvingLocations, pickup.lat, pickup.lng, drop.lat, drop.lng, vehicleType]);

  // The server-authoritative quote — re-fetched whenever pickup, drop,
  // vehicle type, or the resolved distance changes (Part 7's "quote
  // refresh" requirement), plus the manual Retry action. quoteRequestIdRef
  // is the race guard: only the response matching the id issued for THIS
  // effect run is ever applied, so a slow earlier request can never
  // overwrite a faster later one.
  React.useEffect(() => {
    if (resolvingLocations) return;
    const requestId = ++quoteRequestIdRef.current;
    setQuoteLoading(true);
    setQuoteError(false);
    (async () => {
      try {
        const result = await getFareQuote(supabase, {
          vehicleType: vehicleTypeToDb(vehicleType),
          pickup,
          drop,
          distanceKm: liveDistanceKm,
        });
        if (quoteRequestIdRef.current !== requestId) return; // superseded by a newer request
        setQuote(result);
        setQuoteLoading(false);
      } catch {
        if (quoteRequestIdRef.current !== requestId) return;
        setQuote(null);
        setQuoteLoading(false);
        setQuoteError(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvingLocations, pickup.lat, pickup.lng, drop.lat, drop.lng, vehicleType, liveDistanceKm, quoteRetryNonce]);

  function openEditPickup() {
    setEditSheetOpen(true);
  }

  async function handleUseCurrentLocation() {
    setEditSheetOpen(false);
    setResolvingLocations(true);
    const position = await getCurrentPositionOnce();
    if (position) {
      setPickup(position);
      setPickupAddress("Current location");
      setUsedFallback(false);
    } else {
      setUsedFallback(true);
    }
    setResolvingLocations(false);
  }

  function handleSearchPickup() {
    setEditSheetOpen(false);
    router.push(`/search?mode=pickup&return=${encodeURIComponent(params.toString())}`);
  }

  function handleMapSelectPickup() {
    setEditSheetOpen(false);
    router.push(`/booking/map-select?mode=pickup&return=${encodeURIComponent(params.toString())}`);
  }

  async function handleConfirmBooking() {
    // Belt-and-suspenders: the button is already disabled without a valid
    // quote, but handleConfirmBooking never trusts that alone — the server
    // remains authoritative regardless (compute_ride_fare() recalculates
    // and overwrites base_fare/distance_fare/total_fare/surge_multiplier
    // unconditionally at insert time; see that trigger), this guard just
    // avoids sending a request the server would reject anyway.
    if (!user || !quote) return;
    setBooking(true);
    setError(null);
    try {
      // Part 9: pickup/drop/pickupAddress/distanceKm all come from THIS
      // screen's own live state — the exact same coordinates currently
      // quoted below, never the frozen values the Booking screen
      // originally passed via URL params. createRide()'s own haversine
      // floor (packages/data/src/rides.ts) remains the server-side
      // backstop regardless, and the server recomputes/overwrites the
      // fare fields unconditionally — baseFare/distanceFare below are
      // informational only, never trusted as the ride's actual price.
      const ride = await createRide(supabase, {
        passengerId: user.id,
        vehicleType: vehicleTypeToDb(vehicleType),
        pickup,
        pickupAddress,
        drop,
        dropAddress: destination,
        distanceKm: liveDistanceKm,
        baseFare: quote.baseFare,
        distanceFare: quote.distanceFare,
      });
      // Real matching starts here — see @ride-it/data/matching.ts. The
      // Matching screen's own heartbeat (advanceMatching) takes over from
      // this point; this call just avoids an idle first tick.
      await startMatching(supabase, ride.id);
      router.push(`/booking/matching?rideId=${ride.id}&vehicleType=${vehicleTypeToDb(vehicleType)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't book your ride. Try again.");
      setBooking(false);
    }
  }

  const dbType = vehicleTypeToDb(vehicleType);

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-paper">
      {/* Top Navigation Bar */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-2">
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-sm transition-transform active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-bold text-ink">Confirm Booking</h1>
          <p className="text-xs text-ink-soft">Review your trip details</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {resolvingLocations ? (
            <Skeleton className="h-36 w-full rounded-2xl" />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10 shadow-md">
              <RideMap
                pickup={pickup}
                drop={drop}
                routePolyline={liveRoutePolyline}
                fallbackVariant="route"
                className="h-36 border-0 rounded-none"
              />
            </div>
          )}
          {usedFallback && !resolvingLocations && (
            <p className="mt-2 text-xs text-ink-soft">
              Using approximate city coordinates. GPS pickup precision will update when available.
            </p>
          )}

          {/* Connected Route Details Card */}
          <div className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                  <PinGlyph tone="pickup" size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Pickup Point</p>
                  <p className="truncate text-sm font-semibold text-ink">{resolvingLocations ? "Locating…" : pickupAddress}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={openEditPickup}
                disabled={resolvingLocations}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-tint-blue px-2.5 py-1 text-xs font-semibold text-signal-blue transition-colors hover:bg-signal-blue hover:text-white disabled:opacity-50"
              >
                {resolvingLocations ? <RefreshCw size={11} className="animate-spin" /> : <Pencil size={11} />}
                {resolvingLocations ? "Locating…" : "Edit"}
              </button>
            </div>

            <div className="my-2.5 ml-[13px] h-5 w-px border-l-2 border-dashed border-border" />

            <div className="flex items-start justify-between">
              <div className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                  <PinGlyph tone="drop" size={18} />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Drop Location</p>
                  <p className="font-display text-sm font-semibold text-ink">{destination}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Trip Distance & ETA Specs */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
              <Route size={18} className="shrink-0 text-signal-blue" />
              <div>
                <p className="font-meter text-sm font-bold tabular-nums text-ink">{liveDistanceKm.toFixed(2)} km</p>
                <p className="text-[10px] font-medium uppercase text-ink-soft">
                  {usedRealRoute ? "Est. Distance (live route)" : "Est. Distance (approximate)"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
              <Clock3 size={18} className="shrink-0 text-meter-green-text" />
              <div>
                <p className="font-meter text-sm font-bold tabular-nums text-ink">{etaMinutes} mins</p>
                <p className="text-[10px] font-medium uppercase text-ink-soft">Driver ETA</p>
              </div>
            </div>
          </div>

          {/* Selected Vehicle Badge */}
          <div className="mt-3 flex items-center gap-3.5 rounded-xl border border-border bg-surface p-3.5 shadow-sm">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-sm"
              style={{ backgroundColor: visual.tintVar, color: visual.colorVar }}
            >
              <VehicleIcon size={28} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-bold text-ink">{VEHICLE_TYPE_LABELS_DB[dbType]}</p>
              <p className="text-xs text-ink-soft">{VEHICLE_SUBLABEL[dbType]}</p>
            </div>
            <span
              className="rounded-full px-2.5 py-1 text-xs font-bold"
              style={{ backgroundColor: visual.tintVar, color: visual.colorVar }}
            >
              Selected
            </span>
          </div>

          {/* Fare Transparency Breakdown — the SERVER-authoritative quote
              (get_fare_quote(), Part 7 refactor), re-fetched whenever
              pickup/drop/vehicle/distance change. Never a client-computed
              number: while quoteLoading is true, or after a quoteError,
              no fare figure is rendered at all — only the loading/error
              state below. compute_ride_fare() remains the sole
              authoritative calculation once the ride is actually created
              (get_fare_quote() calls the exact same SQL function). */}
          {quoteLoading || resolvingLocations ? (
            <div className="mt-3.5 rounded-2xl border border-marigold/30 bg-tint-marigold/60 p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Fare estimate</p>
              <div className="mt-3 flex items-center gap-2 text-sm font-medium text-ink-soft">
                <RefreshCw size={14} className="animate-spin" />
                Calculating fare…
              </div>
            </div>
          ) : quoteError || !quote ? (
            <div className="mt-3.5 rounded-2xl border border-alert-red/30 bg-alert-red/5 p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Fare estimate</p>
              <p className="mt-2 text-sm font-medium text-alert-red">Unable to calculate fare</p>
              <button
                type="button"
                onClick={() => setQuoteRetryNonce((n) => n + 1)}
                className="mt-3 rounded-full bg-alert-red/10 px-3 py-1.5 text-xs font-semibold text-alert-red transition-colors hover:bg-alert-red/20"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="mt-3.5 rounded-2xl border border-marigold/30 bg-tint-marigold/60 p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Fare estimate</p>
              <div className="mt-2 flex items-center justify-between text-xs font-medium text-ink-soft">
                <span>Base Fare</span>
                <span className="font-meter font-semibold tabular-nums text-ink">₹{quote.baseFare.toFixed(2)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs font-medium text-ink-soft">
                <span>Distance Fare ({liveDistanceKm.toFixed(2)} km)</span>
                <span className="font-meter font-semibold tabular-nums text-ink">₹{quote.distanceFare.toFixed(2)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs font-medium text-ink-soft">
                <span>Surge</span>
                {quote.surgeMultiplier > 1 ? (
                  <span className="font-meter font-bold tabular-nums text-marigold-text">{quote.surgeMultiplier}x applied</span>
                ) : (
                  <span className="font-meter font-bold tabular-nums text-meter-green-text">₹0.00 (Zero Surge)</span>
                )}
              </div>

              <div className="my-3 h-px bg-ink/10" />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Estimated Total</p>
                  <p className="text-xs text-ink-soft">Cash or Direct UPI to Driver</p>
                </div>
                <MeterValue value={`₹${quote.totalFare}`} size="lg" />
              </div>
            </div>
          )}
          {staleRoute && !resolvingLocations && (
            <p className="mt-2 text-xs text-ink-soft">
              Couldn&apos;t refresh the route just now — this quote is for your previous pickup point.
            </p>
          )}
          <p className="mt-2 text-center text-xs text-ink-soft">
            This is an estimate — your fare is calculated and locked by Ridora the moment you confirm your ride
            {!usedRealRoute && ", using an approximate distance right now, so it may differ"}.
          </p>

          <p className="mt-3.5 text-center text-xs text-ink-soft">
            Free cancellation before your driver arrives.
          </p>
          {error && <p className="mt-2 text-center text-xs font-semibold text-alert-red">{error}</p>}
        </motion.div>
      </div>

      {/* Sticky Mobile Confirm Action */}
      <div className="shrink-0 border-t border-border bg-surface/95 backdrop-blur-md px-5 py-4 shadow-sheet">
        <Button
          className="w-full h-12 text-base font-display font-bold shadow-brand transition-transform active:scale-[0.99]"
          size="lg"
          disabled={booking || resolvingLocations || quoteLoading || quoteError || !quote}
          onClick={handleConfirmBooking}
        >
          {booking
            ? "Connecting to nearby drivers…"
            : quoteLoading || resolvingLocations
              ? "Calculating fare…"
              : quoteError || !quote
                ? "Fare unavailable — try again"
                : `Confirm & Find ${VEHICLE_TYPE_LABELS_DB[dbType]}`}
        </Button>
      </div>

      <BottomSheet open={editSheetOpen} onOpenChange={setEditSheetOpen}>
        <div className="flex items-center justify-between">
          <p className="font-display text-lg font-medium text-ink">Edit pickup</p>
          <button onClick={() => setEditSheetOpen(false)} aria-label="Close" className="-m-2.5 p-2.5 text-ink-soft">
            <X size={18} />
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <button
            onClick={handleUseCurrentLocation}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:border-signal-blue/50 hover:bg-tint-blue/20"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tint-blue text-signal-blue">
              <Navigation size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Use current location</span>
              <span className="block text-xs text-ink-soft">Your device&apos;s GPS position</span>
            </span>
          </button>
          <button
            onClick={handleSearchPickup}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:border-signal-blue/50 hover:bg-tint-blue/20"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tint-blue text-signal-blue">
              <Search size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Search for pickup</span>
              <span className="block text-xs text-ink-soft">Find an address or saved place</span>
            </span>
          </button>
          <button
            onClick={handleMapSelectPickup}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:border-signal-blue/50 hover:bg-tint-blue/20"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tint-blue text-signal-blue">
              <MapIcon size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Select pickup on map</span>
              <span className="block text-xs text-ink-soft">Drop a pin at the exact spot</span>
            </span>
          </button>
        </div>
      </BottomSheet>
    </main>
  );
}

export default function ConfirmBookingPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmBookingPageContent />
    </Suspense>
  );
}
