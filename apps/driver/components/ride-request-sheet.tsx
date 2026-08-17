"use client";

import * as React from "react";
import { BottomSheet, RideOfferCard, MeterValue, VEHICLE_VISUALS } from "@ride-it/ui";
import { vehicleTypeToDb, VEHICLE_TYPE_LABELS_DB, type FareEstimate, type GeoPoint } from "@ride-it/types";

const OFFER_WINDOW_SECONDS = 15;

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

  const vehicleKind = vehicleTypeToDb(fare.vehicleType);
  const VehicleIcon = VEHICLE_VISUALS[vehicleKind].icon;

  return (
    <BottomSheet open={open} dismissible={false} className="p-4 pb-8">
      <div className="flex items-center justify-between px-1.5 pt-1">
        <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <VehicleIcon size={18} style={{ color: VEHICLE_VISUALS[vehicleKind].colorVar }} />
          {VEHICLE_TYPE_LABELS_DB[vehicleKind]}
          <span className="text-ink-soft">· {fare.etaMinutes} min away</span>
        </span>
        <MeterValue value={String(secondsLeft).padStart(2, "0")} size="sm" />
      </div>

      <RideOfferCard
        className="mt-3"
        pickupLabel={pickup.address ?? `${pickup.lat}, ${pickup.lng}`}
        pickupDistance={`${fare.distanceKm} km`}
        dropLabel={drop.address ?? `${drop.lat}, ${drop.lng}`}
        fare={`₹${fare.totalFare.toFixed(2)}`}
        onAccept={onAccept}
        onReject={onReject}
      />
    </BottomSheet>
  );
}
