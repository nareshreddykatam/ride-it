"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AutoIcon, BikeIcon, ScootyIcon, CarIcon } from "@ride-it/ui";

const CHIPS = [
  { Icon: AutoIcon, tint: "bg-marigold/20 text-marigold", rotate: -6, x: 0, y: 0, delay: 0 },
  { Icon: BikeIcon, tint: "bg-violet/25 text-white", rotate: 4, x: 54, y: 34, delay: 0.4 },
  { Icon: ScootyIcon, tint: "bg-rose/25 text-white", rotate: -3, x: 18, y: 92, delay: 0.8 },
  { Icon: CarIcon, tint: "bg-cyan/25 text-white", rotate: 7, x: 96, y: 128, delay: 1.2 },
];

/**
 * Landing hero's one restrained 3D+glass moment (Part 6): a small,
 * layered stack of the four real vehicle-type glyphs — not a generic
 * decorative illustration — set with depth (rotation + offset + shadow)
 * and glass chip fills, floating gently. Desktop-only real estate (the
 * hero's negative space right of the headline); never overlaps the
 * headline or CTA, and stays out of the DOM's tab order (aria-hidden) since
 * it's reinforcement, not information.
 */
export function HeroVehicleCluster() {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="pointer-events-none absolute right-10 top-16 hidden h-56 w-56 lg:block"
      style={{ perspective: "800px" }}
      aria-hidden="true"
    >
      {CHIPS.map(({ Icon, tint, rotate, x, y, delay }, i) => (
        <motion.span
          key={i}
          className={`absolute flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 shadow-lg backdrop-blur-md ${tint}`}
          style={{ left: x, top: y, transform: `rotate(${rotate}deg)` }}
          initial={{ opacity: 0, y: 12 }}
          animate={
            reduceMotion
              ? { opacity: 1, y: 0 }
              : { opacity: 1, y: [0, -10, 0] }
          }
          transition={
            reduceMotion
              ? { duration: 0.5, delay: delay / 2 }
              : { duration: 5, repeat: Infinity, ease: "easeInOut", delay }
          }
        >
          <Icon size={30} />
        </motion.span>
      ))}
    </div>
  );
}
