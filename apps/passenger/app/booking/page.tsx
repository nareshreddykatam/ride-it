"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button, VehicleCard } from "@ride-it/ui";
import { VehicleType, vehicleTypeToDb } from "@ride-it/types";
import { computeFareEstimate } from "@ride-it/utils";
import { RideMap, getCurrentPositionOnce, fetchEta, decodePolyline, type LatLng } from "@ride-it/maps";

const VEHICLE_META: Record<VehicleType, { label: string; etaMinutes: number }> = {
  [VehicleType.BIKE]: { label: "Bike", etaMinutes: 3 },
  [VehicleType.SCOOTY]: { label: "Scooty", etaMinutes: 4 },
  [VehicleType.AUTO]: { label: "Auto", etaMinutes: 5 },
  [VehicleType.CAR]: { label: "Car", etaMinutes: 7 },
};

// Used only when real pickup/destination coordinates aren't both
// resolvable (no geolocation permission, or the passenger picked a
// destination via the dev-only fallback list with no known coordinates)
// — the same honest-degradation default this screen always had before
// real distance existed.
const FALLBACK_DISTANCE_KM = 5;

function BookingPageContent() {
  const router = useRouter();
  const params = useSearchParams();
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

  const estimates = React.useMemo(
    () =>
      (Object.values(VehicleType) as VehicleType[]).map((type) => ({
        type,
        estimate: computeFareEstimate(type, distanceKm, VEHICLE_META[type].etaMinutes),
      })),
    [distanceKm]
  );

  async function handleContinue() {
    setConfirming(true);
    const chosen = estimates.find((e) => e.type === selected)!;
    const query = new URLSearchParams({
      destination,
      distanceKm: String(distanceKm),
      vehicleType: selected,
      fare: String(chosen.estimate.totalFare),
      baseFare: String(chosen.estimate.baseFare),
      distanceFare: String(chosen.estimate.distanceFare),
      etaMinutes: String(chosen.estimate.etaMinutes),
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
    <main className="flex flex-1 flex-col px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <RideMap
          pickup={pickup ?? undefined}
          drop={drop ?? undefined}
          routePolyline={routePolyline}
          fallbackVariant="route"
          className="h-40 rounded-2xl"
        />

        <p className="mt-4 text-sm text-ink-soft">To</p>
        <h1 className="font-display text-xl font-semibold text-ink">{destination}</h1>

        <div className="mt-6 flex flex-col gap-3" role="radiogroup" aria-label="Vehicle type">
          {estimates.map(({ type, estimate }, i) => {
            const meta = VEHICLE_META[type];
            const active = selected === type;
            return (
              <motion.div
                key={type}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <VehicleCard
                  type={vehicleTypeToDb(type)}
                  label={meta.label}
                  fare={`₹${estimate.totalFare}`}
                  etaLabel={`${meta.etaMinutes} min away · ${distanceKm.toFixed(1)} km`}
                  selected={active}
                  onSelect={() => setSelected(type)}
                />
              </motion.div>
            );
          })}
        </div>

        <p className="mt-4 text-xs text-ink-soft">
          Fare = base fare + distance. No surge pricing.
          {!usedRealRoute && " Distance shown is approximate until pickup and destination are both confirmed."}
        </p>
      </motion.div>

      <div className="mt-auto pt-8">
        <Button className="w-full" disabled={confirming} onClick={handleContinue}>
          {confirming ? "Loading…" : `Continue with ${VEHICLE_META[selected].label}`}
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
