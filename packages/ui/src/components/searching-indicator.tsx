"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../lib/cn";
import { VEHICLE_VISUALS, type VehicleKind } from "../icons/vehicle-icons";

export interface SearchingIndicatorProps {
  vehicle: VehicleKind;
  label?: string;
  className?: string;
}

/**
 * Matching screen centerpiece — concentric radar rings expanding out from
 * the selected vehicle's icon, in that vehicle's own accent color. Purely
 * decorative/honest ("looking for a driver"), never implies a real distance
 * or countdown the way a progress bar would.
 */
export function SearchingIndicator({ vehicle, label = "Looking for nearby drivers…", className }: SearchingIndicatorProps) {
  const visual = VEHICLE_VISUALS[vehicle];
  const Icon = visual.icon;
  const reduceMotion = useReducedMotion();

  return (
    <div className={cn("flex flex-col items-center justify-center gap-5 py-10", className)}>
      <div className="relative flex h-40 w-40 items-center justify-center">
        {!reduceMotion &&
          [0, 0.7, 1.4].map((delay) => (
            <motion.span
              key={delay}
              className="absolute inset-0 rounded-full"
              style={{ border: `2px solid ${visual.colorVar}` }}
              initial={{ scale: 0.5, opacity: 0.6 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 2.4, repeat: Infinity, delay, ease: "easeOut" }}
            />
          ))}
        <span
          className="relative flex h-20 w-20 items-center justify-center rounded-full shadow-lg"
          style={{ backgroundColor: visual.colorVar }}
        >
          <Icon size={38} className="text-white" strokeWidth={1.6} />
        </span>
      </div>
      <p className="text-sm font-medium text-ink-soft">{label}</p>
    </div>
  );
}
