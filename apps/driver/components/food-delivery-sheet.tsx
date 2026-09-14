"use client";

import * as React from "react";
import { BottomSheet, Button, MeterValue, Card } from "@ride-it/ui";
import { UtensilsCrossed, MapPin } from "lucide-react";
import type { FoodDeliveryOffer } from "@ride-it/data";

const OFFER_WINDOW_SECONDS = 20;

function secondsRemaining(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function OfferCountdownCard({
  offer,
  onAccept,
  onReject,
  onExpire,
}: {
  offer: FoodDeliveryOffer;
  onAccept: (offer: FoodDeliveryOffer) => void;
  onReject: (offer: FoodDeliveryOffer) => void;
  onExpire: (offer: FoodDeliveryOffer) => void;
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

  const urgent = secondsLeft <= 5;
  const distanceKm = offer.distanceToRestaurantMeters != null ? offer.distanceToRestaurantMeters / 1000 : null;

  return (
    <div>
      <div className="flex items-center justify-end px-1">
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${urgent ? "bg-alert-red/10" : "bg-ink/5"}`}>
          <MeterValue value={String(secondsLeft).padStart(2, "0")} size="sm" className={urgent ? "[&>div]:text-alert-red" : "[&>div]:text-ink-soft"} />
          <span className={`text-xs font-medium ${urgent ? "text-alert-red" : "text-ink-soft"}`}>sec left</span>
        </span>
      </div>

      <Card className="mt-2" accent="marigold">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-marigold/15 text-marigold-text">
            <UtensilsCrossed size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{offer.restaurantName}</p>
            <p className="truncate text-xs text-ink-soft">{offer.restaurantAddress}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft">
          <MapPin size={12} />
          {distanceKm != null ? `${distanceKm.toFixed(1)} km to restaurant` : "Distance unavailable"}
        </div>
        <div className="mt-1 truncate text-xs text-ink-soft">Deliver to: {offer.deliveryAddress}</div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-ink-soft">Order value ₹{offer.orderAmount.toFixed(2)}</span>
          <span className="font-meter text-base font-bold text-meter-green-text">Earn ₹{offer.driverEarning.toFixed(2)}</span>
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onReject(offer)}>
            Decline
          </Button>
          <Button className="flex-1" onClick={() => onAccept(offer)}>
            Accept
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function FoodDeliverySheet({
  offers,
  onAccept,
  onReject,
  onExpire,
}: {
  offers: FoodDeliveryOffer[];
  onAccept: (offer: FoodDeliveryOffer) => void;
  onReject: (offer: FoodDeliveryOffer) => void;
  onExpire: (offer: FoodDeliveryOffer) => void;
}) {
  return (
    <BottomSheet open={offers.length > 0} dismissible={false} className="max-h-[85vh] overflow-y-auto p-4 pb-8">
      {offers.length > 1 && (
        <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          {offers.length} delivery requests available
        </p>
      )}
      <div className="space-y-4">
        {offers.map((offer) => (
          <OfferCountdownCard key={offer.id} offer={offer} onAccept={onAccept} onReject={onReject} onExpire={onExpire} />
        ))}
      </div>
    </BottomSheet>
  );
}
