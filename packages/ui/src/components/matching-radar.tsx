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
    <div className={cn("relative flex flex-1 flex-col overflow-hidden bg-[#0c1628]", className)}>
      {/* Full bleed map environment */}
      <div className="absolute inset-0">{mapSlot}</div>

      {/* Dark gradient vignette */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0c1628]/95 via-transparent to-[#0c1628]/60" />

      {/* Center Radar Scanner with Vehicle Silhouetted Disc */}
      <div className="relative flex flex-1 items-center justify-center">
        <div className="relative flex h-64 w-64 items-center justify-center">
          {!reduceMotion &&
            [0, 0.6, 1.2, 1.8].map((delay) => (
              <motion.span
                key={delay}
                className="absolute inset-0 rounded-full"
                style={{
                  border: `2px solid ${visual.colorVar}`,
                  boxShadow: `0 0 16px ${visual.colorVar}40`,
                }}
                initial={{ scale: 0.35, opacity: 0.8 }}
                animate={{ scale: 1.75, opacity: 0 }}
                transition={{ duration: 2.5, repeat: Infinity, delay, ease: "easeOut" }}
              />
            ))}
          <span
            className="relative flex h-24 w-24 items-center justify-center rounded-3xl shadow-2xl transition-transform active:scale-95"
            style={{
              backgroundColor: visual.colorVar,
              boxShadow: `0 12px 36px -4px ${visual.colorVar}70`,
            }}
          >
            <Icon size={54} className="text-white" />
          </span>
        </div>
      </div>

      {/* Elevated Bottom Sheet */}
      <div className="relative rounded-t-sheet border-t border-white/10 bg-surface/95 p-6 pb-8 shadow-sheet backdrop-blur-md">
        <div className="flex items-center justify-between">
          <span
            className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
            style={{ backgroundColor: visual.tintVar, color: visual.colorVar }}
          >
            Looking for {visual.label}
          </span>
          {elapsedLabel && (
            <div className="flex items-center gap-1.5 rounded-full bg-ink/5 px-2.5 py-1 text-xs font-semibold text-ink-soft">
              <span className="h-2 w-2 rounded-full bg-meter-green animate-pulse" />
              <span className="font-meter tabular-nums">{elapsedLabel}</span>
            </div>
          )}
        </div>

        <h2 className="mt-3 font-display text-2xl font-bold text-ink">Connecting your ride</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Contacting closest verified {visual.label} drivers nearby…
        </p>

        {typeof driversNearby === "number" && (
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-meter-green-text">
            <span className="flex h-2 w-2 rounded-full bg-meter-green" />
            <span>{driversNearby} active drivers within 2 km</span>
          </div>
        )}

        {onCancel && (
          <Button variant="outline" className="mt-5 w-full h-11 border-border/80 text-sm font-semibold" onClick={onCancel}>
            Cancel search
          </Button>
        )}
      </div>
    </div>
  );
}
