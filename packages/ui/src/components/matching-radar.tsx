"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../lib/cn";
import { Button } from "./button";
import { VEHICLE_VISUALS, type VehicleKind } from "../icons/vehicle-icons";

export interface MatchingRadarProps {
  vehicle: VehicleKind;
  /** The actual map element (RideMap/MockMap) — rendered full-bleed behind the radar overlay. Kept as a slot so @ride-it/ui never depends on @ride-it/maps. */
  mapSlot: React.ReactNode;
  driversNearby?: number;
  elapsedLabel?: string;
  onCancel?: () => void;
  className?: string;
}

/**
 * The Matching screen's full-bleed composition — map as the environment,
 * not a small preview strip; radar rings expanding from the selected
 * vehicle's own accent color; a bottom scrim panel carrying status copy,
 * a live driver count, elapsed time, and the cancel action. Replaces a
 * plain "Searching…" text block with something that reads as genuinely
 * in-progress.
 */
export function MatchingRadar({ vehicle, mapSlot, driversNearby, elapsedLabel, onCancel, className }: MatchingRadarProps) {
  const visual = VEHICLE_VISUALS[vehicle];
  const Icon = visual.icon;
  const reduceMotion = useReducedMotion();

  return (
    <div className={cn("relative flex flex-1 flex-col overflow-hidden", className)}>
      <div className="absolute inset-0">{mapSlot}</div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/10 to-transparent" />

      <div className="relative flex flex-1 items-center justify-center">
        <div className="relative flex h-48 w-48 items-center justify-center">
          {!reduceMotion &&
            [0, 0.7, 1.4].map((delay) => (
              <motion.span
                key={delay}
                className="absolute inset-0 rounded-full"
                style={{ border: `2px solid ${visual.colorVar}` }}
                initial={{ scale: 0.45, opacity: 0.7 }}
                animate={{ scale: 1.6, opacity: 0 }}
                transition={{ duration: 2.4, repeat: Infinity, delay, ease: "easeOut" }}
              />
            ))}
          <span
            className="relative flex h-20 w-20 items-center justify-center rounded-full shadow-lg"
            style={{ backgroundColor: visual.colorVar }}
          >
            <Icon size={40} className="text-white" strokeWidth={1.5} />
          </span>
        </div>
      </div>

      <div className="relative rounded-t-sheet bg-surface/95 p-6 pb-8 shadow-lg backdrop-blur-sm">
        <p className="font-display text-xs font-bold uppercase tracking-wide" style={{ color: visual.colorVar }}>
          Searching
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold text-ink">Finding your ride</h2>
        <div className="mt-2 flex items-center gap-3 text-sm text-ink-soft">
          {typeof driversNearby === "number" && (
            <span>
              {driversNearby} {driversNearby === 1 ? "driver" : "drivers"} nearby
            </span>
          )}
          {elapsedLabel && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-meter tabular-nums">{elapsedLabel}</span>
            </>
          )}
        </div>
        {onCancel && (
          <Button variant="outline" className="mt-5 w-full" onClick={onCancel}>
            Cancel request
          </Button>
        )}
      </div>
    </div>
  );
}
