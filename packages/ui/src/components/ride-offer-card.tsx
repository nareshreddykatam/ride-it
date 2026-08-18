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
 * The incoming-ride-request unit for the Driver app. A driver has seconds
 * to notice and act on this, so it needs a clear "this needs attention"
 * signal — a solid marigold left border, not a decorative gradient strip.
 * The entrance animation communicates "this just arrived"; nothing else
 * here moves.
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn(
        "rounded-lg border border-border border-l-4 border-l-marigold bg-surface p-5 shadow-md",
        className
      )}
    >
      {VehicleIcon ? (
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: vehicleTintVar, color: vehicleColorVar }}
          >
            <VehicleIcon size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-marigold-text">New ride request</p>
            {vehicleLabel && <p className="mt-0.5 truncate text-sm font-semibold text-ink">{vehicleLabel}</p>}
          </div>
        </div>
      ) : (
        <p className="text-xs font-semibold uppercase tracking-wide text-marigold-text">New ride request</p>
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

      <div className="mt-4 flex flex-col items-center border-t border-border pt-4">
        <p className="text-xs text-ink-soft">You&apos;ll earn</p>
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
    </motion.div>
  );
}
