"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Bike, Car, ShieldOff } from "lucide-react";
import { Card, Skeleton, StatusPill } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getSharedRideInfo, type SharedRideInfo } from "@ride-it/data";
import { RideMap } from "@ride-it/maps";

const STATUS_LABEL: Record<string, string> = {
  requested: "Finding a driver",
  matched: "Finding a driver",
  accepted: "Driver on the way",
  driver_arriving: "Driver arriving",
  ride_started: "Ride in progress",
};

/**
 * No authentication anywhere on this page — the person viewing it is a
 * trusted contact, not a Ride It account holder. Authorization is
 * entirely the token in the URL, validated server-side by
 * get_shared_ride_info() on every load (see that function's migration
 * comment for the full reasoning). This page polls rather than uses
 * Realtime — a one-off recipient view doesn't need a persistent
 * websocket subscription, and polling naturally re-validates
 * expiry/revocation/ride-end on every refresh.
 */
export default function SharedRidePage() {
  const params = useParams<{ token: string }>();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [info, setInfo] = React.useState<SharedRideInfo | null | undefined>(undefined);

  const refresh = React.useCallback(async () => {
    try {
      setInfo(await getSharedRideInfo(supabase, params.token));
    } catch {
      setInfo(null);
    }
  }, [supabase, params.token]);

  React.useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (info === undefined) {
    return (
      <main className="flex flex-1 flex-col px-6 py-8">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-4 h-48 rounded-xl" />
      </main>
    );
  }

  if (info === null) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <ShieldOff size={28} className="text-ink-soft" />
        <p className="mt-3 font-display text-lg font-medium text-ink">This link is no longer active</p>
        <p className="mt-1 max-w-xs text-sm text-ink-soft">
          The share may have expired, been revoked by the passenger, or the ride has ended.
        </p>
      </main>
    );
  }

  const Icon = info.vehicleType === "bike" ? Bike : Car;

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <p className="text-xs text-ink-soft">Shared by a Ride It passenger</p>
        <h1 className="font-display text-xl font-medium text-ink">Live ride status</h1>

        <RideMap driverLocation={info.driverLocation} fallbackVariant="live" className="mt-4 h-48" />

        <Card className="mt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-signal-blue/10 text-signal-blue">
                <Icon size={18} />
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{info.driverName ?? "Driver assigned"}</p>
                <p className="text-xs text-ink-soft">{info.vehicleType === "bike" ? "Bike" : "Auto"}</p>
              </div>
            </div>
            <StatusPill tone="online">{STATUS_LABEL[info.rideStatus] ?? info.rideStatus}</StatusPill>
          </div>
        </Card>

        <Card className="mt-4">
          <div className="flex gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-meter-green" />
            <div>
              <p className="text-xs text-ink-soft">Pickup</p>
              <p className="text-sm text-ink">{info.pickupAddress ?? "—"}</p>
            </div>
          </div>
          <div className="my-3 ml-1 h-4 border-l border-dashed border-border" />
          <div className="flex gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-alert-red" />
            <div>
              <p className="text-xs text-ink-soft">Destination</p>
              <p className="text-sm text-ink">{info.dropAddress ?? "—"}</p>
            </div>
          </div>
        </Card>

        <p className="mt-4 text-center text-xs text-ink-soft">
          This page updates automatically and stops working once the ride ends.
        </p>
      </motion.div>
    </main>
  );
}
