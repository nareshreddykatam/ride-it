"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "../lib/cn";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  /** Accessible name for the dialog when there's no visible heading tied via aria-labelledby */
  "aria-label"?: string;
  /** Id of the element that labels the dialog (e.g. its heading) — preferred over aria-label when a visible title exists */
  "aria-labelledby"?: string;
  /** Id of the element that describes the dialog's body copy */
  "aria-describedby"?: string;
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
  const panelRef = React.useRef<HTMLDivElement>(null);
  const lastFocusedRef = React.useRef<HTMLElement | null>(null);

  // Escape to dismiss, plus a Tab-key focus trap — keyboard focus never
  // leaks to the page behind the dialog while it's open.
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

  // Move focus into the dialog on open, restore it to whatever triggered
  // the dialog on close — keyboard/screen-reader users never lose their
  // place in the page.
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
            {...aria}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={reduceMotion ? { duration: 0.1 } : { type: "spring", damping: 30, stiffness: 380 }}
            className={cn(
              "relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg outline-none",
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
