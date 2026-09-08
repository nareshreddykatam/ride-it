"use client";

import * as React from "react";
import { BottomSheet, Button, RideOfferCard, MeterValue, VEHICLE_VISUALS } from "@ride-it/ui";
import { vehicleTypeToDb, VEHICLE_TYPE_LABELS_DB, type FareEstimate, type GeoPoint } from "@ride-it/types";

const OFFER_WINDOW_SECONDS = 15;

export interface RideOfferItem {
  /** ride_offers.id — identifies this specific offer, distinct from rideId (a driver may hold several offers, each for a different ride). */
  id: string;
  rideId: string;
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
}

export interface RideRequestSheetProps {
  /**
   * Every currently pending, unexpired offer this driver holds — Ridora's
   * correct matching model lets a driver see and choose among several
   * simultaneous eligible rides at once, so this is a list, not a single
   * offer. The sheet stays open as long as at least one offer remains.
   */
  offers: RideOfferItem[];
  onAccept: (offer: RideOfferItem) => void;
  onReject: (offer: RideOfferItem) => void;
  /** Fired automatically for an individual offer that times out — counts as a reject for that offer only, no strike, the rest of the list is unaffected. */
  onExpire: (offer: RideOfferItem) => void;
  /**
   * Whether the driver may have more pending offers beyond the currently
   * loaded page — Ridora never caps how many offers a driver can hold, so
   * this is purely a UI/pagination-performance affordance, not a business
   * limit. Omit (or false) to hide the control entirely.
   */
  hasMore?: boolean;
  /** Fetches and merges in the next page — omit if `hasMore` is never true. */
  onLoadMore?: () => void;
  /** True while a load-more fetch is in flight, to disable the button and avoid duplicate requests. */
  loadingMore?: boolean;
}

function secondsRemaining(expiresAt?: string): number {
  if (!expiresAt) return OFFER_WINDOW_SECONDS;
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

/** One offer's own independent countdown + card — each offer in the list expires on its own server-authoritative clock, unrelated to the others. */
function OfferCountdownCard({
  offer,
  onAccept,
  onReject,
  onExpire,
}: {
  offer: RideOfferItem;
  onAccept: (offer: RideOfferItem) => void;
  onReject: (offer: RideOfferItem) => void;
  onExpire: (offer: RideOfferItem) => void;
}) {
  const [secondsLeft, setSecondsLeft] = React.useState(() => secondsRemaining(offer.expiresAt));

  React.useEffect(() => {
    if (secondsLeft <= 0) {
      onExpire(offer);
      return;
    }
    const t = setTimeout(() => setSecondsLeft(secondsRemaining(offer.expiresAt)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, offer.expiresAt]);

  const vehicleKind = vehicleTypeToDb(offer.fare.vehicleType);
  const visuals = VEHICLE_VISUALS[vehicleKind];
  const urgent = secondsLeft <= 5;

  return (
    <div>
      <div className="flex items-center justify-end px-1">
        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
            urgent ? "bg-alert-red/10" : "bg-ink/5"
          }`}
        >
          <MeterValue
            value={String(secondsLeft).padStart(2, "0")}
            size="sm"
            className={urgent ? "[&>div]:text-alert-red" : "[&>div]:text-ink-soft"}
          />
          <span className={`text-xs font-medium ${urgent ? "text-alert-red" : "text-ink-soft"}`}>sec left</span>
        </span>
      </div>

      <RideOfferCard
        className="mt-2"
        vehicleIcon={visuals.icon}
        vehicleLabel={`${VEHICLE_TYPE_LABELS_DB[vehicleKind]} · ${offer.fare.etaMinutes} min away`}
        vehicleColorVar={visuals.colorVar}
        vehicleTintVar={visuals.tintVar}
        pickupLabel={offer.pickup.address ?? `${offer.pickup.lat}, ${offer.pickup.lng}`}
        pickupDistance={`${offer.fare.distanceKm} km`}
        dropLabel={offer.drop.address ?? `${offer.drop.lat}, ${offer.drop.lng}`}
        fare={`₹${offer.fare.totalFare.toFixed(2)}`}
        onAccept={() => onAccept(offer)}
        onReject={() => onReject(offer)}
      />
    </div>
  );
}

export function RideRequestSheet({
  offers,
  onAccept,
  onReject,
  onExpire,
  hasMore,
  onLoadMore,
  loadingMore,
}: RideRequestSheetProps) {
  return (
    <BottomSheet open={offers.length > 0} dismissible={false} className="max-h-[85vh] overflow-y-auto p-4 pb-8">
      {offers.length > 1 && (
        <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          {offers.length} ride requests available
        </p>
      )}
      <div className="space-y-4">
        {offers.map((offer) => (
          <OfferCountdownCard key={offer.id} offer={offer} onAccept={onAccept} onReject={onReject} onExpire={onExpire} />
        ))}
      </div>
      {hasMore && (
        <Button
          variant="outline"
          className="mt-4 w-full"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? "Loading more…" : "Load more ride requests"}
        </Button>
      )}
    </BottomSheet>
  );
}
