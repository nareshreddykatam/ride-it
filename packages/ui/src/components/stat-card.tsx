import * as React from "react";
import { cn } from "../lib/cn";

const TONE_STYLES = {
  blue: { bg: "bg-tint-blue", fg: "text-signal-blue" },
  marigold: { bg: "bg-tint-marigold", fg: "text-marigold-text" },
  green: { bg: "bg-meter-green/10", fg: "text-meter-green-text" },
  red: { bg: "bg-alert-red/10", fg: "text-alert-red-text" },
  violet: { bg: "bg-tint-violet", fg: "text-violet-text" },
} as const;

export interface StatCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  tone?: keyof typeof TONE_STYLES;
  trend?: string;
  className?: string;
}

/**
 * A single operational metric (Active Rides, Online Drivers, Today's
 * Revenue…) for Admin overview and Driver earnings. Each card gets its own
 * icon + tone so a row of them reads as distinct facts, not four identical
 * white boxes with different numbers.
 */
export function StatCard({ label, value, icon: Icon, tone = "blue", trend, className }: StatCardProps) {
  const t = TONE_STYLES[tone];
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-4 shadow-sm", className)}>
      <div className="flex items-center justify-between">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", t.bg, t.fg)}>
          <Icon size={18} strokeWidth={2} />
        </span>
        {trend && <span className="text-xs font-medium text-meter-green-text">{trend}</span>}
      </div>
      <p className="mt-3 font-meter text-2xl font-medium tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{label}</p>
    </div>
  );
}
