"use client";

import * as React from "react";
import { BottomSheet, Button, MeterValue, StatusPill } from "@ride-it/ui";
import type { FareEstimate, GeoPoint } from "@ride-it/types";

const OFFER_WINDOW_SECONDS = 15;

export interface RideRequestSheetProps {
  open: boolean;
  pickup: GeoPoint;
  drop: GeoPoint;
  fare: FareEstimate;
  onAccept: () => void;
  onReject: () => void;
  /** Fired automatically if the driver doesn't respond in time — counts as a reject, no strike (driver never accepted). */
  onExpire: () => void;
}

export function RideRequestSheet({
  open,
  pickup,
  drop,
  fare,
  onAccept,
  onReject,
  onExpire,
}: RideRequestSheetProps) {
  const [secondsLeft, setSecondsLeft] = React.useState(OFFER_WINDOW_SECONDS);

  React.useEffect(() => {
    if (!open) {
      setSecondsLeft(OFFER_WINDOW_SECONDS);
      return;
    }
    if (secondsLeft <= 0) {
      onExpire();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [open, secondsLeft, onExpire]);

  return (
    <BottomSheet open={open} dismissible={false}>
      <div className="flex items-center justify-between">
        <StatusPill tone="info">New ride request</StatusPill>
        <MeterValue value={String(secondsLeft).padStart(2, "0")} size="md" />
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
