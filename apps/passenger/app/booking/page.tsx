"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, VehicleCard } from "@ride-it/ui";
import { VehicleType, vehicleTypeToDb, vehicleTypeFromDb, type FareEstimate } from "@ride-it/types";
import { computeFareEstimate, type FareRate } from "@ride-it/utils";
import { RideMap, getCurrentPositionOnce, fetchEta, decodePolyline, type LatLng } from "@ride-it/maps";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getActivePricingRules, getSurgeStatus } from "@ride-it/data";

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
  const [pickup, setPickup] = React.useState<LatLng | null>(null);
  const [distanceKm, setDistanceKm] = React.useState(FALLBACK_DISTANCE_KM);
  const [encodedPolyline, setEncodedPolyline] = React.useState<string | null>(null);
  const [usedRealRoute, setUsedRealRoute] = React.useState(false);

  // Real, admin-configured pricing — the same pricing_rules row/surge
  // multiplier compute_ride_fare() itself reads server-side, fetched once
  // per visit to this screen (pricing doesn't change mid-booking under
  // normal operation; the server recomputes fresh at actual ride creation
  // regardless). `null` for a vehicle type means "no active rule
  // configured for it right now" — genuinely unbookable, not a guess.
  const [ratesByVehicle, setRatesByVehicle] = React.useState<Partial<Record<VehicleType, FareRate>> | null>(null);
  const [pricingError, setPricingError] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [rules, surge] = await Promise.all([getActivePricingRules(supabase), getSurgeStatus(supabase)]);
        if (!active) return;
        const surgeByType = new Map(surge.map((s) => [s.vehicle_type, s.vehicle_multiplier]));
        const rates: Partial<Record<VehicleType, FareRate>> = {};
        for (const rule of rules) {
          const type = vehicleTypeFromDb(rule.vehicle_type);
          rates[type] = {
            baseFare: rule.base_fare,
            perKm: rule.per_km_rate,
            surgeMultiplier: surgeByType.get(rule.vehicle_type) ?? 1,
          };
        }
        setRatesByVehicle(rates);
      } catch {
        if (active) setPricingError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  // Resolve pickup once on mount, then — if a real destination coordinate
  // came from the Search screen's Places selection — one real Routes API
  // call for the actual trip distance/route. This REPLACES the previous
  // fabricated per-selection distance (search used to pass a hardcoded
  // distanceKm, e.g. always "3" for saved/recent places) with Google's
  // real distance, while leaving the fare FORMULA itself
  // (computeFareEstimate: base + perKm, unchanged) exactly as it was —
  // only the distance input to that formula is now real when available.
  React.useEffect(() => {
    let active = true;
    (async () => {
      const pos = await getCurrentPositionOnce();
      if (!active) return;
      setPickup(pos);
      if (pos && drop) {
        const eta = await fetchEta(pos, drop, vehicleTypeToDb(selected));
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
    // fare per vehicle is still computed from the same shared distanceKm
    // below, exactly as this screen already did before.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drop?.lat, drop?.lng]);

  const routePolyline = React.useMemo(
    () => (encodedPolyline ? decodePolyline(encodedPolyline) : undefined),
    [encodedPolyline]
  );

  // Real per-vehicle estimate — null when no active pricing_rules row
  // exists for that vehicle type (genuinely unbookable) or the rates
  // fetch itself hasn't resolved/failed yet. No hardcoded per-vehicle
  // price ever appears here; FARE_RATES is never reached from this
  // screen's live path.
  const estimates = React.useMemo(
    () =>
      (Object.values(VehicleType) as VehicleType[]).map((type) => ({
        type,
        estimate: ratesByVehicle?.[type]
          ? computeFareEstimate(type, distanceKm, VEHICLE_META[type].etaMinutes, ratesByVehicle[type])
          : null,
      })),
    [distanceKm, ratesByVehicle]
  );

  const surgeActive = estimates.some((e) => (e.estimate?.surgeMultiplier ?? 1) > 1);
  const selectedEstimate: FareEstimate | null = estimates.find((e) => e.type === selected)?.estimate ?? null;

  // If the default/currently-selected vehicle type turns out to have no
  // active pricing rule once real rates load, fall through to the first
  // vehicle that actually has one — never leave the passenger stuck on an
  // unbookable selection with no obvious way forward.
  React.useEffect(() => {
    if (!ratesByVehicle || selectedEstimate) return;
    const firstAvailable = estimates.find((e) => e.estimate)?.type;
    if (firstAvailable) setSelected(firstAvailable);
  }, [ratesByVehicle, selectedEstimate, estimates]);

  async function handleContinue() {
    if (!selectedEstimate) return;
    setConfirming(true);
    const query = new URLSearchParams({
      destination,
      distanceKm: String(distanceKm),
      vehicleType: selected,
      fare: String(selectedEstimate.totalFare),
      baseFare: String(selectedEstimate.baseFare),
      distanceFare: String(selectedEstimate.distanceFare),
      etaMinutes: String(selectedEstimate.etaMinutes),
      surgeMultiplier: String(selectedEstimate.surgeMultiplier),
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
          {ratesByVehicle && (
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

        {pricingError && (
          <div className="mt-3.5 rounded-xl border border-alert-red/30 bg-alert-red/5 p-3.5 text-center text-xs text-alert-red">
            Fare unavailable — couldn&apos;t load current pricing. Check your connection and try again.
          </div>
        )}

        <div className="mt-3.5 flex flex-col gap-3" role="radiogroup" aria-label="Vehicle type">
          {estimates.map(({ type, estimate }) => {
            const meta = VEHICLE_META[type];
            const active = selected === type;
            const surged = (estimate?.surgeMultiplier ?? 1) > 1;
            return (
              <VehicleCard
                key={type}
                size="hero"
                type={vehicleTypeToDb(type)}
                label={meta.label}
                sublabel={surged ? `${meta.sublabel} · Surge ${estimate!.surgeMultiplier}x` : meta.sublabel}
                capacityLabel={meta.capacity}
                fare={estimate ? `₹${estimate.totalFare}` : ratesByVehicle ? "Unavailable" : "…"}
                etaLabel={`${meta.etaMinutes} min away`}
                selected={active}
                disabled={ratesByVehicle !== null && !estimate}
                recommended={type === RECOMMENDED_TYPE}
                onSelect={() => estimate && setSelected(type)}
              />
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-border/80 bg-surface/60 p-3.5 text-center text-xs text-ink-soft">
          <p className="font-medium text-ink">100% Direct Driver Platform</p>
          <p className="mt-0.5 text-[11px]">
            Fixed rate: Base fare + Distance fare. 0% commission cuts from driver earnings.
          </p>
        </div>
      </div>

      {/* Sticky Mobile CTA */}
      <div className="shrink-0 border-t border-border bg-surface/95 backdrop-blur-md px-5 py-4 shadow-sheet">
        <Button
          className="w-full h-12 text-base font-display font-bold shadow-brand transition-transform active:scale-[0.99]"
          disabled={confirming || !selectedEstimate}
          onClick={handleContinue}
        >
          {confirming
            ? "Preparing your ride…"
            : selectedEstimate
              ? `Book ${VEHICLE_META[selected].label} · ₹${selectedEstimate.totalFare}`
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
