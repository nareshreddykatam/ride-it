"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Bike, Car, Pencil } from "lucide-react";
import { Button, MeterValue } from "@ride-it/ui";
import { VehicleType } from "@ride-it/types";
import { MockMap } from "../../../components/mock-map";

const VEHICLE_ICON: Record<string, typeof Bike> = {
  [VehicleType.BIKE]: Bike,
  [VehicleType.AUTO]: Car,
};

export default function ConfirmBookingPage() {
  const router = useRouter();
  const params = useSearchParams();

  const destination = params.get("destination") ?? "your destination";
  const vehicleType = params.get("vehicleType") ?? VehicleType.AUTO;
  const fare = params.get("fare") ?? "0";
  const etaMinutes = params.get("etaMinutes") ?? "5";

  const [booking, setBooking] = React.useState(false);
  const Icon = VEHICLE_ICON[vehicleType] ?? Car;

  async function handleConfirmBooking() {
    setBooking(true);
    // TODO: wire to ridesApi.bookRide({ pickup, drop, vehicleType })
    await new Promise((r) => setTimeout(r, 500));
    router.push("/booking/matching");
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <h1 className="font-display text-xl font-medium text-ink">Confirm your ride</h1>

        <MockMap variant="route" className="mt-4 h-44" />

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
      </motion.div>

      <div className="mt-auto pt-8">
        <Button className="w-full" disabled={booking} onClick={handleConfirmBooking}>
          {booking ? "Booking your ride…" : "Confirm Booking"}
        </Button>
      </div>
    </main>
  );
}
