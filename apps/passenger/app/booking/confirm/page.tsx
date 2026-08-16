"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Bike, Car, Pencil } from "lucide-react";
import { Button, MeterValue, Skeleton } from "@ride-it/ui";
import { VehicleType } from "@ride-it/types";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { createRide, startMatching } from "@ride-it/data";
import { RideMap, getCurrentPositionOnce, fetchGeocode, type LatLng } from "@ride-it/maps";

const VEHICLE_ICON: Record<string, typeof Bike> = {
  [VehicleType.BIKE]: Bike,
  [VehicleType.AUTO]: Car,
};

// Fallback ONLY when real geolocation/geocoding is unavailable (permission
// denied, no Google API key configured, network failure) — not the
// primary path anymore. Phase 9 replaces the previous hardcoded-always
// demo coordinates with real ones wherever they can be resolved; this
// remains purely as the honest degradation path, matching the same
// pattern used for driver location reporting since Phase 8.
const FALLBACK_PICKUP: LatLng = { lat: 17.385, lng: 78.4867 };
const FALLBACK_DROP: LatLng = { lat: 17.412, lng: 78.4483 };

function ConfirmBookingPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const destination = params.get("destination") ?? "your destination";
  const vehicleType = params.get("vehicleType") ?? VehicleType.AUTO;
  const fare = params.get("fare") ?? "0";
  const baseFare = Number(params.get("baseFare") ?? "0");
  const distanceFare = Number(params.get("distanceFare") ?? "0");
  const distanceKm = Number(params.get("distanceKm") ?? "0");
  const etaMinutes = params.get("etaMinutes") ?? "5";

  const [resolvingLocations, setResolvingLocations] = React.useState(true);
  const [pickup, setPickup] = React.useState<LatLng>(FALLBACK_PICKUP);
  const [drop, setDrop] = React.useState<LatLng>(FALLBACK_DROP);
  const [usedFallback, setUsedFallback] = React.useState(false);
  const [booking, setBooking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const Icon = VEHICLE_ICON[vehicleType] ?? Car;

  // Resolve real coordinates once, on mount — not on every keystroke or
  // re-render. Pickup: browser geolocation. Drop: server-side geocoding of
  // the destination text the passenger already selected on the Search
  // screen. Both fall back honestly (not silently) if unavailable.
  React.useEffect(() => {
    let active = true;
    (async () => {
      const [position, geocoded] = await Promise.all([getCurrentPositionOnce(), fetchGeocode(destination)]);
      if (!active) return;
      if (position) setPickup(position);
      else setUsedFallback(true);
      if (geocoded) setDrop({ lat: geocoded.lat, lng: geocoded.lng });
      else setUsedFallback(true);
      setResolvingLocations(false);
    })();
    return () => {
      active = false;
    };
  }, [destination]);

  async function handleConfirmBooking() {
    if (!user) return;
    setBooking(true);
    setError(null);
    try {
      const ride = await createRide(supabase, {
        passengerId: user.id,
        vehicleType: vehicleType === VehicleType.BIKE ? "bike" : "auto",
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
      router.push(`/booking/matching?rideId=${ride.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't book your ride. Try again.");
      setBooking(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <h1 className="font-display text-xl font-medium text-ink">Confirm your ride</h1>

        {resolvingLocations ? (
          <Skeleton className="mt-4 h-44 w-full rounded-xl" />
        ) : (
          <RideMap pickup={pickup} drop={drop} fallbackVariant="route" className="mt-4 h-44" />
        )}
        {usedFallback && !resolvingLocations && (
          <p className="mt-1.5 text-xs text-ink-soft">
            Using an approximate location — enable location access or check your connection for a precise pickup point.
          </p>
        )}

        <div className="mt-4 rounded-lg border border-border bg-white p-4">
          <div className="flex items-start justify-between">
            <div className="flex gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-meter-green" />
              <div>
                <p className="text-xs text-ink-soft">Pickup</p>
                <p className="text-sm text-ink">Current location</p>
              </div>
            </div>
            <button className="flex items-center gap-1 text-xs text-signal-blue">
              <Pencil size={12} /> Edit
            </button>
          </div>
          <div className="my-3 ml-1 h-4 border-l border-dashed border-border" />
          <div className="flex items-start justify-between">
            <div className="flex gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-alert-red" />
              <div>
                <p className="text-xs text-ink-soft">Drop</p>
                <p className="text-sm text-ink">{destination}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-white p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-signal-blue/10 text-signal-blue">
              <Icon size={20} />
            </span>
            <div>
              <p className="font-display text-sm font-medium text-ink">
                {vehicleType === VehicleType.BIKE ? "Bike" : "Auto"}
              </p>
              <p className="text-xs text-ink-soft">Arrives in {etaMinutes} min</p>
            </div>
          </div>
          <MeterValue value={`₹${fare}`} size="md" />
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
