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
 * The driver app's signature control — the one visual element that answers
 * "am I online and earning?" at a glance. Built around a large circular
 * status disc (pulsing ring when online) rather than a generic switch or
 * rectangular button, so the on/off state reads instantly even at a
 * glance, not just on close inspection.
 */
export function OnlineToggle({ online, disabled, loading, subtitle, onToggle, className }: OnlineToggleProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      disabled={disabled || loading}
      whileTap={disabled || loading ? undefined : { scale: 0.985 }}
      aria-pressed={online}
      className={cn(
        "relative flex w-full items-center gap-5 overflow-hidden rounded-2xl p-5 text-left shadow-lg transition-colors disabled:opacity-60",
        online ? "bg-gradient-online text-white" : "bg-ink text-white",
        className
      )}
    >
      {online && !reduceMotion && (
        <motion.span
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(circle at 15% 50%, rgba(255,255,255,0.16), transparent 55%)" }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <span className="relative flex h-16 w-16 shrink-0 items-center justify-center">
        {online &&
          !reduceMotion &&
          [0, 0.9].map((delay) => (
            <motion.span
              key={delay}
              className="absolute inset-0 rounded-full border-2 border-white/70"
              initial={{ scale: 0.6, opacity: 0.7 }}
              animate={{ scale: 1.7, opacity: 0 }}
              transition={{ duration: 2.2, repeat: Infinity, delay, ease: "easeOut" }}
            />
          ))}
        <span
          className={cn(
            "relative flex h-11 w-11 items-center justify-center rounded-full border-[3px] transition-colors",
            online ? "border-white bg-white/15" : "border-white/40 bg-transparent"
          )}
        >
          <span className={cn("h-3.5 w-3.5 rounded-full transition-colors", online ? "bg-white" : "bg-white/40")} />
        </span>
      </span>

      <span className="relative min-w-0 flex-1">
        <span className="block font-display text-xl font-bold leading-tight">
          {online ? "You're online" : "Go online"}
        </span>
        <span className="mt-0.5 block text-sm opacity-85">{subtitle}</span>
      </span>
    </motion.button>
  );
}
