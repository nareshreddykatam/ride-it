"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "../lib/cn";
import { MeterValue } from "./meter-value";
import { VEHICLE_VISUALS, type VehicleKind } from "../icons/vehicle-icons";

export interface VehicleCardProps {
  type: VehicleKind;
  /** Overrides the default vehicle label ("Auto", "Bike"…) if the caller needs product-specific copy */
  label?: string;
  /** Secondary line under the label in "hero" size only, e.g. "Auto Rickshaw" */
  sublabel?: string;
  fare: string;
  etaLabel: string;
  selected?: boolean;
  disabled?: boolean;
  /** Shows a "Recommended" pill — "hero" size only, use on exactly one vehicle at a time */
  recommended?: boolean;
  onSelect?: () => void;
  className?: string;
  /**
   * "compact" — the dense row form (history lists, anywhere space is tight).
   * "hero" — Booking's row form: same list-row structure as "compact" but
   * with a slightly larger icon and room for a sublabel/"Recommended" tag,
   * matching a plain professional fare-comparison list — not a decorative
   * illustration card. Default "compact" for backward compatibility.
   */
  size?: "compact" | "hero";
}

/**
 * The vehicle-selection unit used on Booking and anywhere a fare needs to
 * be compared across vehicle types. Each vehicle owns one accent color
 * (see VEHICLE_VISUALS) so the icon container, selected border, and check
 * indicator are always the same hue for that vehicle everywhere it shows up.
 */
export function VehicleCard({
  type,
  label,
  sublabel,
  fare,
  etaLabel,
  selected,
  disabled,
  recommended,
  onSelect,
  className,
  size = "compact",
}: VehicleCardProps) {
  const visual = VEHICLE_VISUALS[type];
  const Icon = visual.icon;

  if (size === "hero") {
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={disabled}
        onClick={onSelect}
        className={cn("w-full text-left disabled:cursor-not-allowed disabled:opacity-50", className)}
      >
        <div
          style={{ borderColor: selected ? visual.colorVar : "var(--border)" }}
          className={cn(
            "flex items-center gap-3 rounded-lg border bg-surface p-3.5 shadow-sm transition-colors",
            selected && "border-[1.5px]"
          )}
        >
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: visual.tintVar, color: visual.colorVar }}
          >
            <Icon size={24} strokeWidth={1.8} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="font-display text-sm font-semibold text-ink">{label ?? visual.label}</p>
              {recommended && <span className="text-[11px] font-medium text-meter-green-text">· Recommended</span>}
            </div>
            {sublabel && <p className="text-xs text-ink-soft">{sublabel}</p>}
            <p className="text-xs text-ink-soft">{etaLabel}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <MeterValue value={fare} size="sm" />
            {selected ? (
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full"
                style={{ backgroundColor: visual.colorVar }}
                aria-hidden="true"
              >
                <Check size={12} strokeWidth={3} className="text-white" />
              </span>
            ) : (
              <ChevronRight size={16} className="text-ink-soft" aria-hidden="true" />
            )}
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn("text-left disabled:cursor-not-allowed disabled:opacity-50", className)}
    >
      <motion.div
        initial={false}
        animate={{ scale: selected ? 1 : 1, y: selected ? -1 : 0 }}
        whileTap={disabled ? undefined : { scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        style={{
          borderColor: selected ? visual.colorVar : "var(--border)",
          backgroundColor: selected ? visual.tintVar : "var(--surface)",
        }}
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border-2 p-3.5 transition-shadow",
          selected ? "shadow-md" : "shadow-sm"
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-transform"
            style={{
              backgroundColor: selected ? visual.colorVar : "color-mix(in srgb, var(--ink) 6%, transparent)",
              color: selected ? "white" : "var(--ink-soft)",
            }}
          >
            <Icon size={26} strokeWidth={1.7} />
          </span>
          <div>
            <p className="font-display text-sm font-semibold text-ink">{label ?? visual.label}</p>
            <p className="text-xs text-ink-soft">{etaLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <MeterValue value={fare} size="sm" />
          <span
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
              selected ? "scale-100 opacity-100" : "scale-75 opacity-0"
            )}
            style={{ backgroundColor: visual.colorVar, borderColor: visual.colorVar }}
            aria-hidden="true"
          >
            <Check size={12} strokeWidth={3} className="text-white" />
          </span>
        </div>
      </motion.div>
    </button>
  );
}
