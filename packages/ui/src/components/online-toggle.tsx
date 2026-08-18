"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../lib/cn";

export interface OnlineToggleProps {
  online: boolean;
  disabled?: boolean;
  loading?: boolean;
  subtitle: string;
  onToggle: () => void;
  className?: string;
}

/**
 * The driver app's online/offline control — a plain bordered row with a
 * status dot, not a giant animated hero button. The dot pulses subtly
 * only when online; everything else about this control is deliberately
 * quiet (surface background, normal border, no gradient fill) so the
 * on/off state is the one thing that reads, not the chrome around it.
 */
export function OnlineToggle({ online, disabled, loading, subtitle, onToggle, className }: OnlineToggleProps) {
  const reduceMotion = useReducedMotion();

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || loading}
      aria-pressed={online}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-lg border p-4 text-left transition-colors disabled:opacity-60",
        online ? "border-meter-green/40 bg-meter-green/5" : "border-border bg-surface",
        className
      )}
    >
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
        {online && !reduceMotion && (
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-meter-green"
            initial={{ scale: 0.6, opacity: 0.6 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span
          className={cn(
            "relative h-3 w-3 rounded-full border-2",
            online ? "border-meter-green bg-meter-green" : "border-ink-soft bg-transparent"
          )}
        />
      </span>

      <span className="min-w-0 flex-1">
        <span className={cn("block font-display text-base font-semibold", online ? "text-meter-green-text" : "text-ink")}>
          {online ? "Online" : "Offline"}
        </span>
        <span className="mt-0.5 block text-xs text-ink-soft">{subtitle}</span>
      </span>

      <span
        className={cn(
          "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold",
          online ? "border-meter-green/30 text-meter-green-text" : "border-border text-ink-soft"
        )}
      >
        {loading ? "…" : online ? "Go offline" : "Go online"}
      </span>
    </button>
  );
}
