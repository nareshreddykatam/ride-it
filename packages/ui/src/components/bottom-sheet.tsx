"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "../lib/cn";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const reduceMotion = useReducedMotion();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const lastFocusedRef = React.useRef<HTMLElement | null>(null);

  // Same Escape-to-dismiss + Tab focus trap as Dialog — a bottom sheet is
  // a modal too, just anchored to the bottom edge for thumb reach.
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        onOpenChange?.(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, dismissible, onOpenChange]);

  React.useEffect(() => {
    if (open) {
      lastFocusedRef.current = document.activeElement as HTMLElement | null;
      const id = requestAnimationFrame(() => {
        const focusable = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        (focusable ?? panelRef.current)?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
    lastFocusedRef.current?.focus();
    lastFocusedRef.current = null;
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.div
            className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : undefined}
            onClick={() => dismissible && onOpenChange?.(false)}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            initial={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            transition={reduceMotion ? { duration: 0.1 } : { type: "spring", damping: 28, stiffness: 320 }}
            className={cn(
              "relative z-10 w-full max-w-md rounded-sheet border-t border-border bg-surface p-6 pb-8 shadow-lg outline-none",
              className
            )}
          >
            <span className="absolute left-1/2 top-2.5 h-1 w-10 -translate-x-1/2 rounded-full bg-ink/15" aria-hidden="true" />
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
