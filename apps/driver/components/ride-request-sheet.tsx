"use client";

import * as React from "react";
import { Bike, Car } from "lucide-react";
import { BottomSheet, Button, MeterValue, StatusPill } from "@ride-it/ui";
import { VehicleType, vehicleTypeToDb, VEHICLE_TYPE_LABELS_DB, type FareEstimate, type GeoPoint } from "@ride-it/types";

const OFFER_WINDOW_SECONDS = 15;

function VehicleIcon({ vehicleType }: { vehicleType: VehicleType }) {
  return vehicleType === VehicleType.BIKE || vehicleType === VehicleType.SCOOTY ? (
    <Bike size={16} aria-hidden="true" />
  ) : (
    <Car size={16} aria-hidden="true" />
  );
}

export interface RideRequestSheetProps {
  open: boolean;
  pickup: GeoPoint;
  drop: GeoPoint;
  fare: FareEstimate;
  /**
   * Real server-authoritative expiry (ride_offers.expires_at) — when
   * provided, the countdown reflects actual remaining time instead of
   * restarting a fixed local 15s clock. The accept_ride_offer() RPC
   * enforces this server-side regardless of what the UI shows or how the
   * browser is manipulated; this prop just keeps the displayed number
   * honest.
   */
  expiresAt?: string;
  onAccept: () => void;
  onReject: () => void;
  /** Fired automatically if the driver doesn't respond in time — counts as a reject, no strike (driver never accepted). */
  onExpire: () => void;
}

function secondsRemaining(expiresAt?: string): number {
  if (!expiresAt) return OFFER_WINDOW_SECONDS;
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export function RideRequestSheet({
  open,
  pickup,
  drop,
  fare,
  expiresAt,
  onAccept,
  onReject,
  onExpire,
}: RideRequestSheetProps) {
  const [secondsLeft, setSecondsLeft] = React.useState(() => secondsRemaining(expiresAt));

  React.useEffect(() => {
    if (!open) {
      setSecondsLeft(secondsRemaining(expiresAt));
      return;
    }
    if (secondsLeft <= 0) {
      onExpire();
      return;
    }
    const t = setTimeout(() => setSecondsLeft(secondsRemaining(expiresAt)), 1000);
    return () => clearTimeout(t);
  }, [open, secondsLeft, expiresAt, onExpire]);

  return (
    <BottomSheet open={open} dismissible={false}>
      <div className="flex items-center justify-between">
        <StatusPill tone="info">New ride request</StatusPill>
        <MeterValue value={String(secondsLeft).padStart(2, "0")} size="md" />
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-sm font-medium text-ink">
        <VehicleIcon vehicleType={fare.vehicleType} />
        {VEHICLE_TYPE_LABELS_DB[vehicleTypeToDb(fare.vehicleType)]}
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex gap-2">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-meter-green" />
          <span className="text-ink">{pickup.address ?? `${pickup.lat}, ${pickup.lng}`}</span>
        </div>
        <div className="flex gap-2">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-alert-red" />
          <span className="text-ink">{drop.address ?? `${drop.lat}, ${drop.lng}`}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <MeterValue value={`₹${fare.totalFare.toFixed(2)}`} label={`${fare.distanceKm} km fare`} size="lg" />
        <span className="text-xs text-ink-soft">{fare.etaMinutes} min away</span>
      </div>

      <div className="mt-6 flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onReject}>
          Reject
        </Button>
        <Button className="flex-1" onClick={onAccept}>
          Accept
        </Button>
      </div>
    </BottomSheet>
  );
}
