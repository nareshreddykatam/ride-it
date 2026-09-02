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
        "flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all duration-200 disabled:opacity-60",
        online
          ? "border-meter-green/50 bg-meter-green/10 shadow-sm"
          : "border-border bg-surface hover:border-ink/20 shadow-sm",
        className
      )}
    >
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
        {online && !reduceMotion && (
          <motion.span
            className="absolute inset-0 rounded-full bg-meter-green"
            initial={{ scale: 0.8, opacity: 0.4 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span
          className={cn(
            "relative flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-colors",
            online ? "bg-meter-green text-white" : "bg-ink/10 text-ink-soft"
          )}
        >
          <span className={cn("h-3 w-3 rounded-full", online ? "bg-white animate-pulse" : "bg-ink-soft")} />
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className={cn("block font-display text-base font-bold", online ? "text-meter-green-text" : "text-ink")}>
          {online ? "You are Online" : "You are Offline"}
        </span>
        <span className="mt-0.5 block text-xs text-ink-soft">{subtitle}</span>
      </span>

      <span
        className={cn(
          "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors shadow-sm",
          online
            ? "bg-meter-green text-white"
            : "bg-ink text-white"
        )}
      >
        {loading ? "…" : online ? "Go Offline" : "Go Online"}
      </span>
    </button>
  );
}
