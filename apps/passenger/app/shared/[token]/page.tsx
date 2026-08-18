"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { ShieldOff } from "lucide-react";
import { Card, PinGlyph, Skeleton, StatusPill, VEHICLE_VISUALS } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getSharedRideInfo, type SharedRideInfo } from "@ride-it/data";
import { RideMap } from "@ride-it/maps";
import { VEHICLE_TYPE_LABELS_DB } from "@ride-it/types";

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
        <Skeleton className="mt-4 h-48 rounded-lg" />
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

  const visual = VEHICLE_VISUALS[info.vehicleType];
  const VehicleIcon = visual.icon;

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <p className="text-xs font-medium text-signal-blue">Shared by a Ride It passenger</p>
        <h1 className="mt-1 font-display text-xl font-semibold text-ink">Live ride status</h1>

        <RideMap driverLocation={info.driverLocation} fallbackVariant="live" className="mt-4 h-48 rounded-lg" />

        <Card tone="elevated" className="mt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: visual.tintVar, color: visual.colorVar }}
              >
                <VehicleIcon size={20} strokeWidth={1.7} />
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{info.driverName ?? "Driver assigned"}</p>
                <p className="text-xs text-ink-soft">{VEHICLE_TYPE_LABELS_DB[info.vehicleType] ?? info.vehicleType}</p>
              </div>
            </div>
            <StatusPill tone="online">{STATUS_LABEL[info.rideStatus] ?? info.rideStatus}</StatusPill>
          </div>
        </Card>

        <Card className="mt-4">
          <div className="flex gap-3">
            <PinGlyph tone="pickup" size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-ink-soft">Pickup</p>
              <p className="text-sm text-ink">{info.pickupAddress ?? "—"}</p>
            </div>
          </div>
          <div className="my-3 ml-[9px] h-4 w-px border-l border-dashed border-border" />
          <div className="flex gap-3">
            <PinGlyph tone="drop" size={18} className="mt-0.5 shrink-0" />
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
