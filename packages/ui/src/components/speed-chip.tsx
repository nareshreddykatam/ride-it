"use client";

import * as React from "react";
import { Gauge } from "lucide-react";
import { cn } from "../lib/cn";
import { MeterValue } from "./meter-value";

export interface SpeedChipProps {
  /** Latest known speed in km/h — ignored (treated as unavailable) whenever `stale` is true. */
  speedKmh: number | null;
  /** True once the source (driver's own GPS, or the passenger's realtime feed of it) hasn't produced a fresh reading recently — see SPEED_CONFIG.STALE_THRESHOLD_SECONDS in @ride-it/maps. */
  stale: boolean;
  className?: string;
}

/**
 * Compact live-speed pill shown to both driver and passenger during an
 * active ride — small enough to sit as a map overlay without covering
 * navigation/PIN/ride controls. Shows "Speed unavailable" rather than a
 * frozen number whenever the underlying reading is stale or missing,
 * matching the same overlay-chip visual language as the Dashboard's
 * "Looking for rides nearby" pill (bg-surface/95, shadow-sm, backdrop-blur).
 */
export function SpeedChip({ speedKmh, stale, className }: SpeedChipProps) {
  const available = !stale && speedKmh !== null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full bg-surface/95 px-3 py-1.5 shadow-sm backdrop-blur-sm",
        className
      )}
    >
      <Gauge size={16} className={available ? "text-signal-blue" : "text-ink-soft"} aria-hidden="true" />
      {available ? (
        <MeterValue value={String(Math.round(speedKmh))} label="km/h" size="sm" />
      ) : (
        <span className="text-xs font-medium text-ink-soft">Speed unavailable</span>
      )}
    </div>
  );
}
