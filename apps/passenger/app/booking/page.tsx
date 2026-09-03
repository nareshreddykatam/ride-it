"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button, VehicleCard } from "@ride-it/ui";
import { VehicleType, vehicleTypeToDb } from "@ride-it/types";
import { RideMap, getCurrentPositionOnce, fetchEta, decodePolyline, type LatLng } from "@ride-it/maps";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getFareQuote, type FareQuote } from "@ride-it/data";

const VEHICLE_META: Record<VehicleType, { label: string; sublabel: string; capacity: string; etaMinutes: number }> = {
  [VehicleType.BIKE]: { label: "Bike", sublabel: "Motorcycle", capacity: "1 seat", etaMinutes: 3 },
  [VehicleType.SCOOTY]: { label: "Scooty", sublabel: "Scooter", capacity: "1 seat", etaMinutes: 4 },
  [VehicleType.AUTO]: { label: "Auto", sublabel: "Auto Rickshaw", capacity: "3 seats", etaMinutes: 5 },
  [VehicleType.CAR]: { label: "Car", sublabel: "Sedan", capacity: "4 seats", etaMinutes: 7 },
};

// The platform's flagship, most economical vehicle class — a fixed
// editorial "recommended" designation independent of whatever the
// passenger currently has selected, same as Uber/Ola surface one default
// recommendation regardless of the tapped state.
const RECOMMENDED_TYPE = VehicleType.AUTO;

// Used only when real pickup/destination coordinates aren't both
// resolvable (no geolocation permission, or the passenger picked a
// destination via the dev-only fallback list with no known coordinates)
// — the same honest-degradation default this screen always had before
// real distance existed.
const FALLBACK_DISTANCE_KM = 5;

// get_fare_quote() needs a real pickup POINT (it's not just a distance
// number — the server re-derives/sanity-checks distance from the actual
// coordinates), so unlike the old client formula this screen can no
// longer quote with pickup=null while geolocation is denied/unavailable.
// Same fallback point booking/confirm/page.tsx already uses for the exact
// same reason — an honest approximate pickup, not a blocked screen.
const FALLBACK_PICKUP: LatLng = { lat: 16.5062, lng: 80.648 };

function BookingPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const destination = params.get("destination") ?? "your destination";
  const destLatParam = params.get("destLat");
  const destLngParam = params.get("destLng");
  const drop: LatLng | null = destLatParam && destLngParam ? { lat: Number(destLatParam), lng: Number(destLngParam) } : null;

  const [selected, setSelected] = React.useState<VehicleType>(VehicleType.AUTO);
  const [confirming, setConfirming] = React.useState(false);
  const [pickup, setPickup] = React.useState<LatLng>(FALLBACK_PICKUP);
  const [distanceKm, setDistanceKm] = React.useState(FALLBACK_DISTANCE_KM);
  const [encodedPolyline, setEncodedPolyline] = React.useState<string | null>(null);
  const [usedRealRoute, setUsedRealRoute] = React.useState(false);

  // Server-authoritative quotes for all 4 vehicle types (get_fare_quote(),
  // the same calculation compute_ride_fare() applies at ride creation —
  // see packages/data/src/pricing.ts). Requires real pickup+drop
  // coordinates and a resolved distance, so this only fetches once all
  // three are ready; missing/failed for a vehicle type means "genuinely
  // unbookable right now", never a guessed/fallback price. quotesRequestId
  // guards the same race the Confirm screen guards against — a stale
  // response from an earlier pickup/drop/distance is discarded rather than
  // overwriting quotes for the current one.
  const [quotesByVehicle, setQuotesByVehicle] = React.useState<Partial<Record<VehicleType, FareQuote>> | null>(null);
  const [quotesLoading, setQuotesLoading] = React.useState(false);
  const [quotesError, setQuotesError] = React.useState(false);
  const quotesRequestIdRef = React.useRef(0);

  React.useEffect(() => {
    if (!drop) return;
    const requestId = ++quotesRequestIdRef.current;
    setQuotesLoading(true);
    setQuotesError(false);
    (async () => {
      const types = Object.values(VehicleType) as VehicleType[];
      const results = await Promise.allSettled(
        types.map((type) =>
          getFareQuote(supabase, { vehicleType: vehicleTypeToDb(type), pickup, drop, distanceKm }).then(
            (quote) => [type, quote] as const
          )
        )
      );
      if (quotesRequestIdRef.current !== requestId) return; // superseded by a newer request
      const quotes: Partial<Record<VehicleType, FareQuote>> = {};
      let anySucceeded = false;
      for (const result of results) {
        if (result.status === "fulfilled") {
          const [type, quote] = result.value;
          quotes[type] = quote;
          anySucceeded = true;
        }
      }
      setQuotesByVehicle(quotes);
      setQuotesLoading(false);
      setQuotesError(!anySucceeded);
    })();
  }, [supabase, pickup, drop, distanceKm]);

  // Resolve pickup once on mount, then — if a real destination coordinate
  // came from the Search screen's Places selection — one real Routes API
  // call for the actual trip distance/route. This REPLACES the previous
  // fabricated per-selection distance (search used to pass a hardcoded
  // distanceKm, e.g. always "3" for saved/recent places) with Google's
  // real distance — the quotes effect above then recomputes fare for the
  // real distance the moment it lands.
  React.useEffect(() => {
    let active = true;
    (async () => {
      const pos = await getCurrentPositionOnce();
      if (!active) return;
      if (pos) setPickup(pos);
      const effectivePickup = pos ?? FALLBACK_PICKUP;
      if (drop) {
        const eta = await fetchEta(effectivePickup, drop, vehicleTypeToDb(selected));
        if (!active) return;
        if (eta) {
          setDistanceKm(Math.max(0.1, eta.distanceMeters / 1000));
          setEncodedPolyline(eta.encodedPolyline);
          setUsedRealRoute(true);
        }
      }
    })();
    return () => {
      active = false;
    };
    // Only re-resolve if the destination coordinate itself changes — not
    // on every vehicle-type click, per the explicit "don't call route
    // APIs excessively" cost-control instruction. The initially-selected
    // vehicle's travel mode is good enough for one representative route;
    // fare per vehicle is still quoted from the same shared distanceKm
    // below, exactly as this screen already did before.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drop?.lat, drop?.lng]);

  const routePolyline = React.useMemo(
    () => (encodedPolyline ? decodePolyline(encodedPolyline) : undefined),
    [encodedPolyline]
  );

  // Real per-vehicle quote — undefined while quotesByVehicle hasn't
  // resolved yet, missing for a vehicle type means "genuinely unbookable
  // right now" (no active pricing rule, or the quote call itself failed).
  const estimates = React.useMemo(
    () =>
      (Object.values(VehicleType) as VehicleType[]).map((type) => ({
        type,
        quote: quotesByVehicle?.[type] ?? null,
      })),
    [quotesByVehicle]
  );

  const surgeActive = estimates.some((e) => (e.quote?.surgeMultiplier ?? 1) > 1);
  const selectedQuote: FareQuote | null = estimates.find((e) => e.type === selected)?.quote ?? null;

  // If the default/currently-selected vehicle type turns out to have no
  // active pricing rule once real quotes load, fall through to the first
  // vehicle that actually has one — never leave the passenger stuck on an
  // unbookable selection with no obvious way forward.
  React.useEffect(() => {
    if (!quotesByVehicle || selectedQuote) return;
    const firstAvailable = estimates.find((e) => e.quote)?.type;
    if (firstAvailable) setSelected(firstAvailable);
  }, [quotesByVehicle, selectedQuote, estimates]);

  async function handleContinue() {
    if (!selectedQuote) return;
    setConfirming(true);
    // fare/baseFare/distanceFare/surgeMultiplier are deliberately NOT
    // forwarded here — the Confirm screen fetches its own fresh server
    // quote on mount (Part 7) rather than trusting a number carried across
    // a navigation, so there is never a client-relayed fare in the URL for
    // this screen to construct. Only the inputs (destination/distance/
    // vehicle/route) cross the boundary.
    const query = new URLSearchParams({
      destination,
      distanceKm: String(distanceKm),
      vehicleType: selected,
      etaMinutes: String(VEHICLE_META[selected].etaMinutes),
      usedRealRoute: String(usedRealRoute),
    });
    if (drop) {
      query.set("destLat", String(drop.lat));
      query.set("destLng", String(drop.lng));
    }
    // Forward the already-fetched route geometry so Confirm doesn't spend
    // a second Routes API call just to redraw the same route.
    if (encodedPolyline) query.set("routePolyline", encodedPolyline);
    await new Promise((r) => setTimeout(r, 250));
    router.push(`/booking/confirm?${query.toString()}`);
  }

  return (
    <main className="flex flex-1 flex-col bg-paper">
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
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Destination</p>
          <h1 className="truncate font-display text-base font-bold text-ink">{destination}</h1>
        </div>
      </div>

      {/* The route preview map */}
      <div className="shrink-0 px-5 pt-2">
        <div className="overflow-hidden rounded-2xl border border-white/10 shadow-md">
          <RideMap
            pickup={pickup ?? undefined}
            drop={drop ?? undefined}
            routePolyline={routePolyline}
            fallbackVariant="route"
            className="h-44 border-0 rounded-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-base font-bold text-ink">Choose your ride</p>
          {quotesByVehicle && (
            <span
              className={
                surgeActive
                  ? "rounded-full bg-marigold/15 px-2.5 py-1 text-[11px] font-semibold text-marigold-text"
                  : "rounded-full bg-tint-blue px-2.5 py-1 text-[11px] font-semibold text-signal-blue"
              }
            >
              {surgeActive ? "Surge pricing active" : "No surge pricing"}
            </span>
          )}
        </div>

        {!drop || quotesLoading ? (
          <div className="mt-3.5 flex items-center gap-2 rounded-xl border border-border/80 bg-surface/60 p-3.5 text-center text-xs text-ink-soft">
            <RefreshCw size={13} className="animate-spin" />
            Calculating fare…
          </div>
        ) : (
          quotesError && (
            <div className="mt-3.5 rounded-xl border border-alert-red/30 bg-alert-red/5 p-3.5 text-center text-xs text-alert-red">
              Unable to calculate fare — check your connection and try again.
            </div>
          )
        )}

        <div className="mt-3.5 flex flex-col gap-3" role="radiogroup" aria-label="Vehicle type">
          {estimates.map(({ type, quote }) => {
            const meta = VEHICLE_META[type];
            const active = selected === type;
            const surged = (quote?.surgeMultiplier ?? 1) > 1;
            const fareLabel = quote ? `₹${quote.totalFare}` : !drop || quotesLoading ? "…" : "Unavailable";
            return (
              <VehicleCard
                key={type}
                size="hero"
                type={vehicleTypeToDb(type)}
                label={meta.label}
                sublabel={surged ? `${meta.sublabel} · Surge ${quote!.surgeMultiplier}x` : meta.sublabel}
                capacityLabel={meta.capacity}
                fare={fareLabel}
                etaLabel={`${meta.etaMinutes} min away`}
                selected={active}
                disabled={quotesByVehicle !== null && !quote}
                recommended={type === RECOMMENDED_TYPE}
                onSelect={() => quote && setSelected(type)}
              />
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-border/80 bg-surface/60 p-3.5 text-center text-xs text-ink-soft">
          <p className="font-medium text-ink">
            {usedRealRoute ? `Estimated distance: ${distanceKm.toFixed(1)} km` : "Estimated fare — exact route unavailable"}
          </p>
          <p className="mt-0.5 text-[11px]">
            {usedRealRoute
              ? "This is a server-calculated estimate from your live route. Your fare is calculated and locked by Ridora the moment you confirm your ride."
              : "We couldn't calculate your exact route right now, so this estimate uses an approximate distance. Your fare is calculated and locked by Ridora the moment you confirm your ride."}
          </p>
        </div>
      </div>

      {/* Sticky Mobile CTA */}
      <div className="shrink-0 border-t border-border bg-surface/95 backdrop-blur-md px-5 py-4 shadow-sheet">
        <Button
          className="w-full h-12 text-base font-display font-bold shadow-brand transition-transform active:scale-[0.99]"
          disabled={confirming || !selectedQuote}
          onClick={handleContinue}
        >
          {confirming
            ? "Preparing your ride…"
            : selectedQuote
              ? `Book ${VEHICLE_META[selected].label} · ₹${selectedQuote.totalFare}`
              : "Fare unavailable"}
        </Button>
      </div>
    </main>
  );
}

export default function BookingPage() {
  return (
    <Suspense fallback={null}>
      <BookingPageContent />
    </Suspense>
  );
}
