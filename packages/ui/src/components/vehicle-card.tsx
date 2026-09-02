"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "../lib/cn";
import { MeterValue } from "./meter-value";
import { VEHICLE_VISUALS, type VehicleKind } from "../icons/vehicle-icons";

export interface VehicleCardProps {
  type: VehicleKind;
  /** Overrides the default vehicle label ("Auto", "Bike"…) if the caller needs product-specific copy */
  label?: string;
  /** Secondary line under the label in "hero" size only, e.g. "Auto Rickshaw" */
  sublabel?: string;
  /** e.g. "3 seats" — "hero" size only, general vehicle-class capacity, not per-ride data */
  capacityLabel?: string;
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
  capacityLabel,
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
          style={{
            borderColor: selected ? visual.colorVar : "var(--border)",
            backgroundColor: selected ? `color-mix(in srgb, ${visual.colorVar} 6%, var(--surface))` : "var(--surface)",
            boxShadow: selected
              ? `0 10px 24px -6px color-mix(in srgb, ${visual.colorVar} 40%, transparent)`
              : "var(--shadow-sm)",
          }}
          className={cn(
            "flex items-center gap-4 rounded-xl border p-4 transition-all duration-200",
            selected ? "border-2 scale-[1.01]" : "hover:border-ink/20"
          )}
        >
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl transition-colors shadow-sm"
            style={{
              backgroundColor: selected ? visual.colorVar : visual.tintVar,
              color: selected ? "white" : visual.colorVar,
            }}
          >
            <Icon size={38} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="font-display text-base font-semibold text-ink">{label ?? visual.label}</p>
              {recommended && (
                <span className="rounded-full bg-meter-green/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-meter-green-text">
                  Recommended
                </span>
              )}
            </div>
            {(sublabel ?? visual.sublabel) && (
              <p className="text-xs text-ink-soft">{sublabel ?? visual.sublabel}</p>
            )}
            <p className="text-xs font-medium text-ink-soft">
              {(capacityLabel ?? visual.capacity) && <>{capacityLabel ?? visual.capacity} · </>}
              {etaLabel}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <MeterValue value={fare} size="md" />
            {selected && (
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full shadow-sm"
                style={{ backgroundColor: visual.colorVar }}
                aria-hidden="true"
              >
                <Check size={12} strokeWidth={3} className="text-white" />
              </span>
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
            className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform shadow-sm"
            style={{
              backgroundColor: selected ? visual.colorVar : visual.tintVar,
              color: selected ? "white" : visual.colorVar,
            }}
          >
            <Icon size={28} />
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
