"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "../lib/cn";

export interface DialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  /** Accessible name for the dialog when there's no visible heading tied via aria-labelledby */
  "aria-label"?: string;
  dismissible?: boolean;
}

export function Dialog({
  open,
  onOpenChange,
  children,
  className,
  dismissible = true,
  ...aria
}: DialogProps) {
  const reduceMotion = useReducedMotion();

  React.useEffect(() => {
    if (!open || !dismissible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange?.(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, dismissible, onOpenChange]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-ink/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : undefined}
            onClick={() => dismissible && onOpenChange?.(false)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            {...aria}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={reduceMotion ? { duration: 0.1 } : { type: "spring", damping: 30, stiffness: 380 }}
            className={cn(
              "relative z-10 w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-lg",
              className
            )}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
