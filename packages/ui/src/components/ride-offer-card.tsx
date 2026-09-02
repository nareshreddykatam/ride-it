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
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn(
        "rounded-2xl border-2 border-marigold/60 bg-surface p-5 shadow-sheet",
        className
      )}
    >
      <div className="flex items-center justify-between">
        {VehicleIcon ? (
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-sm"
              style={{ backgroundColor: vehicleTintVar, color: vehicleColorVar }}
            >
              <VehicleIcon size={26} />
            </span>
            <div className="min-w-0">
              <span className="rounded-full bg-marigold/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-marigold-text">
                Incoming Request
              </span>
              {vehicleLabel && <p className="mt-0.5 truncate font-display text-sm font-bold text-ink">{vehicleLabel}</p>}
            </div>
          </div>
        ) : (
          <span className="rounded-full bg-marigold/20 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-marigold-text">
            Incoming Request
          </span>
        )}

        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Guaranteed Fare</p>
          <MeterValue value={fare} size="md" />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-paper/60 p-3.5 space-y-2.5">
        <div className="flex items-start gap-2.5">
          <PinGlyph tone="pickup" size={18} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Pickup</p>
            <p className="truncate text-sm font-semibold text-ink">{pickupLabel}</p>
            {pickupDistance && <p className="text-xs text-signal-blue font-medium">{pickupDistance} away</p>}
          </div>
        </div>

        <div className="ml-[9px] h-3 w-px border-l border-dashed border-border" aria-hidden="true" />

        <div className="flex items-start gap-2.5">
          <PinGlyph tone="drop" size={18} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Drop Location</p>
            <p className="truncate text-sm font-semibold text-ink">{dropLabel}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Button
          variant="success"
          size="lg"
          className="w-full h-12 text-base font-display font-bold shadow-md transition-transform active:scale-[0.99]"
          onClick={onAccept}
          disabled={acceptDisabled}
        >
          Accept Ride Request
        </Button>
        <button
          type="button"
          onClick={onReject}
          className="w-full py-2.5 text-center text-xs font-semibold text-ink-soft transition-colors hover:text-alert-red active:scale-95"
        >
          Decline
        </button>
      </div>
    </motion.div>
  );
}
