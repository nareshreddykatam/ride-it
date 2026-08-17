"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../lib/cn";
import { PulseDot } from "./pulse-dot";

export interface OnlineToggleProps {
  online: boolean;
  disabled?: boolean;
  loading?: boolean;
  subtitle: string;
  onToggle: () => void;
  className?: string;
}

/**
 * The driver app's single most important control. Large, thumb-reachable,
 * unmistakably "on" vs "off" — a live pulse dot + gradient fill when
 * online, flat ink when off. Extracted from Dashboard so the same control
 * (and its exact motion/visual language) can't drift if it's ever reused
 * elsewhere (e.g. a future driver-side widget).
 */
export function OnlineToggle({ online, disabled, loading, subtitle, onToggle, className }: OnlineToggleProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      disabled={disabled || loading}
      whileTap={disabled || loading ? undefined : { scale: 0.98 }}
      aria-pressed={online}
      className={cn(
        "relative flex w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl py-9 text-white shadow-lg transition-colors disabled:opacity-60",
        online ? "bg-gradient-online" : "bg-ink",
        className
      )}
    >
      {online && !reduceMotion && (
        <motion.span
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.18), transparent 60%)",
          }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <span className="relative flex items-center gap-2">
        {online && <PulseDot tone="green" className="[&_span]:bg-white" />}
        <span className="font-display text-xl font-semibold">{online ? "You're online" : "Go online"}</span>
      </span>
      <span className="relative text-xs opacity-85">{subtitle}</span>
    </motion.button>
  );
}
