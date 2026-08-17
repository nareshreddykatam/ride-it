"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Pencil } from "lucide-react";
import { Button, MeterValue, Skeleton, PinGlyph, VEHICLE_VISUALS } from "@ride-it/ui";
import { VehicleType, vehicleTypeToDb, VEHICLE_TYPE_LABELS_DB } from "@ride-it/types";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { createRide, startMatching } from "@ride-it/data";
import { RideMap, getCurrentPositionOnce, fetchGeocode, decodePolyline, type LatLng } from "@ride-it/maps";

// Fallback ONLY when real geolocation/geocoding is unavailable (permission
// denied, no Google API key configured, network failure) — not the
// primary path anymore. Phase 9 replaces the previous hardcoded-always
// demo coordinates with real ones wherever they can be resolved; this
// remains purely as the honest degradation path, matching the same
// pattern used for driver location reporting since Phase 8.
const FALLBACK_PICKUP: LatLng = { lat: 16.5062, lng: 80.648 };
const FALLBACK_DROP: LatLng = { lat: 16.5449, lng: 80.6116 };

function ConfirmBookingPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const destination = params.get("destination") ?? "your destination";
  const vehicleType = (params.get("vehicleType") as VehicleType | null) ?? VehicleType.AUTO;
  const fare = params.get("fare") ?? "0";
  const baseFare = Number(params.get("baseFare") ?? "0");
  const distanceFare = Number(params.get("distanceFare") ?? "0");
  const distanceKm = Number(params.get("distanceKm") ?? "0");
  const etaMinutes = params.get("etaMinutes") ?? "5";
  const destLatParam = params.get("destLat");
  const destLngParam = params.get("destLng");
  const knownDrop: LatLng | null = destLatParam && destLngParam ? { lat: Number(destLatParam), lng: Number(destLngParam) } : null;
  const encodedPolyline = params.get("routePolyline");
  const routePolyline = React.useMemo(() => (encodedPolyline ? decodePolyline(encodedPolyline) : undefined), [encodedPolyline]);

  const [resolvingLocations, setResolvingLocations] = React.useState(true);
  const [pickup, setPickup] = React.useState<LatLng>(FALLBACK_PICKUP);
  const [drop, setDrop] = React.useState<LatLng>(knownDrop ?? FALLBACK_DROP);
  const [usedFallback, setUsedFallback] = React.useState(false);
  const [booking, setBooking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const visual = VEHICLE_VISUALS[vehicleTypeToDb(vehicleType)];
  const VehicleIcon = visual.icon;

  // Resolve real coordinates once, on mount — not on every keystroke or
  // re-render. Pickup: fresh browser geolocation (deliberately re-resolved
  // here rather than reused from the Booking screen — this is the
  // passenger's actual position at the moment they're about to book, not
  // whatever it was a screen ago). Drop: reuses the coordinate the Search
  // screen already resolved via Places Autocomplete (knownDrop) when
  // available — server-side geocoding of the destination TEXT is now only
  // a fallback for the cases that never had real coordinates (the
  // dev-only fallback list, or a Places lookup that failed) — previously
  // this always re-geocoded the text, which could silently return
  // different coordinates than whatever the Booking screen's distance/fare
  // estimate was actually computed from.
  const resolveLocations = React.useCallback(async () => {
    setResolvingLocations(true);
    const position = await getCurrentPositionOnce();
    if (position) {
      setPickup(position);
      setUsedFallback(false);
    } else {
      setUsedFallback(true);
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
  }, [destination, destLatParam, destLngParam]);

  React.useEffect(() => {
    resolveLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirmBooking() {
    if (!user) return;
    setBooking(true);
    setError(null);
    try {
      const ride = await createRide(supabase, {
        passengerId: user.id,
        vehicleType: vehicleTypeToDb(vehicleType),
        pickup,
        pickupAddress: "Current location",
        drop,
        dropAddress: destination,
        distanceKm,
        baseFare,
        distanceFare,
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

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <h1 className="font-display text-xl font-semibold text-ink">Confirm your ride</h1>

        {resolvingLocations ? (
          <Skeleton className="mt-4 h-44 w-full rounded-2xl" />
        ) : (
          <RideMap
            pickup={pickup}
            drop={drop}
            routePolyline={routePolyline}
            fallbackVariant="route"
            className="mt-4 h-44 rounded-2xl"
          />
        )}
        {usedFallback && !resolvingLocations && (
          <p className="mt-1.5 text-xs text-ink-soft">
            Using an approximate location — enable location access or check your connection for a precise pickup point.
          </p>
        )}

        <div className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex gap-3">
              <PinGlyph tone="pickup" size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-ink-soft">Pickup</p>
                <p className="text-sm text-ink">Current location</p>
              </div>
            </div>
            <button
              type="button"
              onClick={resolveLocations}
              disabled={resolvingLocations}
              className="flex items-center gap-1 text-xs text-signal-blue disabled:opacity-50"
            >
              <Pencil size={12} /> {resolvingLocations ? "Locating…" : "Refresh"}
            </button>
          </div>
          <div className="my-3 ml-[9px] h-4 w-px border-l border-dashed border-border" />
          <div className="flex items-start justify-between">
            <div className="flex gap-3">
              <PinGlyph tone="drop" size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-ink-soft">Drop</p>
                <p className="text-sm text-ink">{destination}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-lg"
              style={{ backgroundColor: visual.tintVar, color: visual.colorVar }}
            >
              <VehicleIcon size={22} strokeWidth={1.7} />
            </span>
            <div>
              <p className="font-display text-sm font-semibold text-ink">
                {VEHICLE_TYPE_LABELS_DB[vehicleTypeToDb(vehicleType)]}
              </p>
              <p className="text-xs text-ink-soft">Arrives in {etaMinutes} min</p>
            </div>
          </div>
          <MeterValue value={`₹${fare}`} size="lg" />
        </div>

        <p className="mt-4 text-xs text-ink-soft">
          You can cancel free of charge before the driver arrives.
        </p>
        {error && <p className="mt-2 text-xs text-alert-red">{error}</p>}
      </motion.div>

      <div className="mt-auto pt-8">
        <Button className="w-full" disabled={booking || resolvingLocations} onClick={handleConfirmBooking}>
          {booking ? "Booking your ride…" : "Confirm Booking"}
        </Button>
      </div>
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
