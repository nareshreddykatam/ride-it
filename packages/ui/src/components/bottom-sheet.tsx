"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../lib/cn";

export interface BottomSheetProps {
  open: boolean;
  children: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
  /** Set false to hide the backdrop-tap-to-dismiss affordance, e.g. for a
   * ride request the driver must explicitly accept or reject. */
  dismissible?: boolean;
  className?: string;
}

export function BottomSheet({
  open,
  children,
  onOpenChange,
  dismissible = true,
  className,
}: BottomSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.div
            className="absolute inset-0 bg-ink/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => dismissible && onOpenChange?.(false)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className={cn(
              "relative z-10 w-full max-w-md rounded-sheet border-t border-border bg-white p-6 pb-8",
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
