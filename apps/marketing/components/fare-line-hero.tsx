"use client";

import { motion } from "framer-motion";

/**
 * Signature hero element. Two lines racing left-to-right over time:
 * - "Other apps": jagged, spiky line — an unpredictable per-ride commission cut
 * - "Ride It": a flat, calm line — one fixed subscription fee, drivers keep the rest
 * This is the product's actual structural difference, rendered as the thesis
 * image rather than a generic gradient-stat hero.
 */
export function FareLineHero() {
  return (
    <div className="w-full rounded-xl border border-border bg-white p-6">
      <svg viewBox="0 0 480 160" className="w-full" role="img" aria-label="Ride It flat subscription fee compared to competitors' variable per-ride commission">
        {/* Jagged competitor line */}
        <motion.path
          d="M0,60 L40,90 L80,40 L120,100 L160,50 L200,110 L240,45 L280,95 L320,55 L360,105 L400,50 L440,90 L480,60"
          fill="none"
          stroke="var(--ink-soft)"
          strokeWidth="2.5"
          strokeDasharray="4 3"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: "easeInOut" }}
        />
        {/* Ride It flat line */}
        <motion.line
          x1="0"
          y1="130"
          x2="480"
          y2="130"
          stroke="var(--signal-blue)"
          strokeWidth="3.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-ink-soft">
          <span className="h-2 w-2 rounded-full border border-dashed border-ink-soft" />
          Other apps — commission varies every ride
        </span>
        <span className="flex items-center gap-1.5 font-medium text-signal-blue">
          <span className="h-2 w-2 rounded-full bg-signal-blue" />
          Ride It — one flat subscription
        </span>
      </div>
    </div>
  );
}
