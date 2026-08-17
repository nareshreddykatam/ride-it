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
        <p className="text-center font-display text-xs font-bold uppercase tracking-wide text-marigold-text">
          New ride request
        </p>

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

        <div className="mt-5 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onReject}>
            Reject
          </Button>
          <Button variant="success" className="flex-1" onClick={onAccept} disabled={acceptDisabled}>
            Accept
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
