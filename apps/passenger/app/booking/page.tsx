"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Bike, Car, CarFront, Zap } from "lucide-react";
import { Button, MeterValue, cn } from "@ride-it/ui";
import { VehicleType } from "@ride-it/types";
import { computeFareEstimate } from "@ride-it/utils";
import { MockMap } from "@ride-it/maps";

const VEHICLE_META: Record<VehicleType, { label: string; icon: typeof Bike; etaMinutes: number }> = {
  [VehicleType.BIKE]: { label: "Bike", icon: Bike, etaMinutes: 3 },
  [VehicleType.SCOOTY]: { label: "Scooty", icon: Zap, etaMinutes: 4 },
  [VehicleType.AUTO]: { label: "Auto", icon: Car, etaMinutes: 5 },
  [VehicleType.CAR]: { label: "Car", icon: CarFront, etaMinutes: 7 },
};

function BookingPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const destination = params.get("destination") ?? "your destination";
  const distanceKm = Number(params.get("distanceKm") ?? "5");

  const [selected, setSelected] = React.useState<VehicleType>(VehicleType.AUTO);
  const [confirming, setConfirming] = React.useState(false);

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
    await new Promise((r) => setTimeout(r, 250));
    router.push(`/booking/confirm?${query.toString()}`);
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <MockMap variant="route" className="h-40" />

        <p className="mt-4 text-sm text-ink-soft">To</p>
        <h1 className="font-display text-xl font-medium text-ink">{destination}</h1>

        <div className="mt-6 flex flex-col gap-3">
          {estimates.map(({ type, estimate }) => {
            const meta = VEHICLE_META[type];
            const Icon = meta.icon;
            const active = selected === type;
            return (
              <button key={type} onClick={() => setSelected(type)} className="text-left">
                <div
                  className={cn(
                    "flex items-center justify-between rounded-lg border bg-white p-4",
                    active ? "border-2 border-signal-blue" : "border-border"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg",
                        active ? "bg-signal-blue/10 text-signal-blue" : "bg-ink/5 text-ink-soft"
                      )}
                    >
                      <Icon size={20} />
                    </span>
                    <div>
                      <p className="font-display text-sm font-medium text-ink">{meta.label}</p>
                      <p className="text-xs text-ink-soft">{meta.etaMinutes} min away · {distanceKm} km</p>
                    </div>
                  </div>
                  <MeterValue value={`₹${estimate.totalFare}`} size="md" />
                </div>
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-xs text-ink-soft">
          Fare = base fare + distance. No surge pricing.
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
