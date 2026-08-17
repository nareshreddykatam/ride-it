"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog } from "./dialog";
import { Button } from "./button";
import { cn } from "../lib/cn";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  /** Use "destructive" for actions that suspend, refund, delete, or otherwise cannot be trivially undone. */
  tone?: "default" | "destructive";
  loading?: boolean;
}

/**
 * Shared confirmation modal for irreversible/high-consequence admin actions
 * (refunds, suspensions, maintenance mode). Centered dialog rather than a
 * bottom sheet — matches Admin's desktop-first layout per DESIGN_SYSTEM.md.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  tone = "default",
  loading,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} aria-label={title}>
      <div className="flex items-start gap-3">
        {tone === "destructive" && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-alert-red/10 text-alert-red">
            <AlertTriangle size={20} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-medium text-ink">{title}</h2>
          {description && <p className="mt-1.5 text-sm text-ink-soft">{description}</p>}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" size="md" onClick={() => onOpenChange(false)} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === "destructive" ? "destructive" : "primary"}
          size="md"
          loading={loading}
          onClick={() => onConfirm()}
          className={cn(tone === "destructive" && "min-w-24")}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
