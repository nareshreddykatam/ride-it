"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../lib/cn";

export interface MeterValueProps {
  /** Formatted string, e.g. "₹128.50" or "₹1,240" */
  value: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
};

/**
 * Renders a live numeric value (fare, earnings, wallet balance) as
 * individually-ticking mono digits — the same visual language as OtpInput,
 * so "the number you're being charged/paid" always reads consistently
 * across the app. See DESIGN_SYSTEM.md — signature element.
 */
export function MeterValue({ value, label, size = "md", className }: MeterValueProps) {
  const chars = value.split("");

  return (
    <div className={cn("inline-flex flex-col items-start", className)}>
      <div className={cn("flex font-meter tabular-nums text-ink", sizeClasses[size])}>
        {chars.map((char, i) => (
          <span key={`${i}-${char}`} className="relative inline-block overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={char}
                initial={{ y: "-60%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "60%", opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="inline-block"
              >
                {char}
              </motion.span>
            </AnimatePresence>
          </span>
        ))}
      </div>
      {label && <span className="mt-0.5 text-xs text-ink-soft">{label}</span>}
    </div>
  );
}
