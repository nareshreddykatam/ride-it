"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "../lib/cn";
import { Button } from "./button";
import { MeterValue } from "./meter-value";
import { PinGlyph } from "../icons/map-markers";

export interface RideOfferCardProps {
  pickupLabel: string;
  pickupDistance?: string;
  dropLabel: string;
  fare: string;
  onAccept: () => void;
  onReject: () => void;
  acceptDisabled?: boolean;
  className?: string;
  /** Optional vehicle identity — rendered as a large icon badge in the header so the driver sees at a glance which of their vehicles the request is for, not a small inline glyph. */
  vehicleIcon?: React.ElementType;
  vehicleLabel?: string;
  vehicleColorVar?: string;
  vehicleTintVar?: string;
}

/**
 * The incoming-ride-request unit for the Driver app — deliberately reads
 * like a live alert (colored top edge, entrance animation) rather than a
 * quiet card, since a driver has seconds to notice and act on it.
 */
export function RideOfferCard({
  pickupLabel,
  pickupDistance,
  dropLabel,
  fare,
  onAccept,
  onReject,
  acceptDisabled,
  className,
  vehicleIcon: VehicleIcon,
  vehicleLabel,
  vehicleColorVar,
  vehicleTintVar,
}: RideOfferCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-surface shadow-lg",
        className
      )}
    >
      <div className="h-1.5 w-full bg-gradient-cta" />
      <div className="p-5">
        {VehicleIcon ? (
          <div className="flex items-center gap-3.5">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
              style={{ backgroundColor: vehicleTintVar, color: vehicleColorVar }}
            >
              <VehicleIcon size={30} />
            </span>
            <div className="min-w-0">
              <p className="font-display text-xs font-bold uppercase tracking-wide text-marigold-text">
                New ride request
              </p>
              {vehicleLabel && <p className="mt-0.5 truncate text-sm font-semibold text-ink">{vehicleLabel}</p>}
            </div>
          </div>
        ) : (
          <p className="text-center font-display text-xs font-bold uppercase tracking-wide text-marigold-text">
            New ride request
          </p>
        )}

        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <PinGlyph tone="pickup" size={18} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{pickupLabel}</p>
              {pickupDistance && <p className="text-xs text-ink-soft">{pickupDistance} away</p>}
            </div>
          </div>
          <div className="ml-[9px] h-3 w-px bg-border" aria-hidden="true" />
          <div className="flex items-start gap-2.5">
            <PinGlyph tone="drop" size={18} className="mt-0.5 shrink-0" />
            <p className="truncate text-sm font-medium text-ink">{dropLabel}</p>
          </div>
        </div>

        <div className="mt-4 flex justify-center">
          <MeterValue value={fare} size="lg" />
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <Button variant="success" size="lg" className="w-full" onClick={onAccept} disabled={acceptDisabled}>
            Accept ride
          </Button>
          <button
            type="button"
            onClick={onReject}
            className="w-full rounded-lg py-3 text-center text-sm font-medium text-ink-soft transition-colors hover:text-alert-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert-red/40"
          >
            Reject
          </button>
        </div>
      </div>
    </motion.div>
  );
}
