"use client";

import * as React from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { Navigation } from "lucide-react";
import { cn } from "../lib/cn";

export interface SlideToActionProps {
  label: string;
  onComplete: () => void;
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
}

const THUMB_SIZE = 52;
const TRACK_INSET = 4;
/** Fraction of the track a drag must cross to count as a completed slide — short of the true end so a driver doesn't have to drag pixel-perfect to the wall. */
const COMPLETE_THRESHOLD = 0.82;

/**
 * Generic slide-to-confirm control — first used for the driver's "Slide to
 * start navigation" (Phase 7 of the map-ecosystem task), but built as a
 * reusable @ride-it/ui primitive rather than one-off page code, the same
 * way BottomSheet/ConfirmDialog are shared rather than redefined per call
 * site.
 *
 * Dragging the thumb to (or past) COMPLETE_THRESHOLD fires onComplete and
 * springs the thumb back to the start, ready to be used again — this
 * control confirms a repeatable action (re-open navigation), not a
 * one-shot irreversible one, so unlike an "end trip" style slider it
 * doesn't stay locked in the completed position.
 *
 * A slide gesture alone would exclude keyboard/screen-reader users, so the
 * thumb is also a real focusable, Enter/Space-activatable button
 * (role="button") that animates itself through the same completion path —
 * not a separate, differently-behaved fallback.
 */
export function SlideToAction({ label, onComplete, disabled, className, icon }: SlideToActionProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [maxDrag, setMaxDrag] = React.useState(0);
  const firedRef = React.useRef(false);

  React.useEffect(() => {
    if (!trackRef.current) return;
    const measure = () => setMaxDrag(Math.max(0, trackRef.current!.offsetWidth - THUMB_SIZE - TRACK_INSET * 2));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  function fire() {
    if (firedRef.current || disabled) return;
    firedRef.current = true;
    onComplete();
    animate(x, 0, { type: "spring", damping: 22, stiffness: 220 });
    window.setTimeout(() => {
      firedRef.current = false;
    }, 600);
  }

  function handleKeyboardActivate() {
    if (disabled || maxDrag === 0) return;
    animate(x, maxDrag, { duration: 0.18, ease: "easeOut" });
    window.setTimeout(fire, 200);
  }

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative flex h-14 w-full items-center overflow-hidden rounded-full border border-signal-blue/30 bg-signal-blue/10",
        disabled && "opacity-50",
        className
      )}
    >
      <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-16 text-center text-sm font-semibold text-signal-blue">
        {label}
      </p>
      <motion.div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-disabled={disabled || undefined}
        drag={disabled ? false : "x"}
        dragConstraints={{ left: 0, right: maxDrag }}
        dragElastic={0.04}
        dragMomentum={false}
        style={{ x, width: THUMB_SIZE, height: THUMB_SIZE }}
        className="relative z-10 ml-1 flex shrink-0 cursor-grab items-center justify-center rounded-full bg-signal-blue text-white shadow-md active:cursor-grabbing"
        onDragEnd={() => {
          if (maxDrag > 0 && x.get() >= maxDrag * COMPLETE_THRESHOLD) {
            fire();
          } else {
            animate(x, 0, { type: "spring", damping: 22, stiffness: 220 });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleKeyboardActivate();
          }
        }}
      >
        {icon ?? <Navigation size={20} aria-hidden="true" />}
      </motion.div>
    </div>
  );
}
