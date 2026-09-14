"use client";

import * as React from "react";
import { Navigation, Phone } from "lucide-react";
import { Button, Card, StatusPill } from "@ride-it/ui";
import { getExternalNavigationUrl } from "@ride-it/maps";

export interface ActiveFoodDeliveryInfo {
  orderId: string;
  status: "driver_assigned" | "picked_up" | "out_for_delivery";
  restaurantName: string;
  restaurantAddress: string;
  restaurantLat: number;
  restaurantLng: number;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  recipientPhone: string;
  totalAmount: number;
  paymentMethod: "cod" | "online";
}

/**
 * Map-first, minimal-distraction card for the driver's single active
 * delivery — mirrors spec section 22's flow (Accept -> Navigate to
 * restaurant -> Pickup confirmation -> Navigate to customer -> Delivery
 * confirmation). Google Maps handoff is external (getExternalNavigationUrl),
 * same pattern the existing ride navigation screen uses.
 */
export function ActiveFoodDeliveryCard({
  delivery,
  onMarkPickedUp,
  onMarkDelivered,
  busy,
}: {
  delivery: ActiveFoodDeliveryInfo;
  onMarkPickedUp: () => void;
  onMarkDelivered: () => void;
  busy?: boolean;
}) {
  const headedToRestaurant = delivery.status === "driver_assigned";
  const destination = headedToRestaurant
    ? { lat: delivery.restaurantLat, lng: delivery.restaurantLng }
    : { lat: delivery.deliveryLat, lng: delivery.deliveryLng };
  const destinationLabel = headedToRestaurant ? delivery.restaurantAddress : delivery.deliveryAddress;

  return (
    <Card className="mt-4" accent="marigold">
      <div className="flex items-center justify-between">
        <StatusPill tone="pending">{headedToRestaurant ? "Heading to restaurant" : "Delivering to customer"}</StatusPill>
        <span className="text-xs text-ink-soft">{delivery.paymentMethod === "cod" ? "Collect COD" : "Paid online"}</span>
      </div>

      <p className="mt-3 text-sm font-semibold text-ink">{headedToRestaurant ? delivery.restaurantName : "Customer delivery"}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{destinationLabel}</p>

      {delivery.paymentMethod === "cod" && !headedToRestaurant && (
        <p className="mt-2 text-sm font-bold text-marigold-text">Collect ₹{delivery.totalAmount.toFixed(2)}</p>
      )}

      <div className="mt-4 flex gap-2">
        <a
          href={getExternalNavigationUrl(destination)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-semibold text-ink"
        >
          <Navigation size={15} /> Navigate
        </a>
        {!headedToRestaurant && (
          <a
            href={`tel:${delivery.recipientPhone}`}
            className="flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-ink"
          >
            <Phone size={15} />
          </a>
        )}
      </div>

      {delivery.status === "driver_assigned" && (
        <Button className="mt-3 w-full" loading={busy} onClick={onMarkPickedUp}>
          Confirm pickup
        </Button>
      )}
      {delivery.status === "out_for_delivery" && (
        <Button className="mt-3 w-full" variant="success" loading={busy} onClick={onMarkDelivered}>
          Confirm delivery
        </Button>
      )}
    </Card>
  );
}
