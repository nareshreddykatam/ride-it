import * as React from "react";
import { cn } from "../lib/cn";
import { PulseDot } from "./pulse-dot";

const TONE_FG: Record<string, string> = {
  blue: "text-signal-blue",
  marigold: "text-marigold-text",
  green: "text-meter-green-text",
  red: "text-alert-red-text",
  violet: "text-violet-text",
};

export interface LiveStatBandItem {
  label: string;
  value: string;
  icon: React.ElementType;
  tone?: keyof typeof TONE_FG;
}

export interface LiveStatBandProps {
  items: LiveStatBandItem[];
  eyebrow?: string;
  className?: string;
}

/**
 * Admin overview's headline panel — one unified operations-center strip
 * (numbers side by side, thin dividers) instead of four identical boxed
 * StatCards. Reserve StatCard for secondary/section-level metrics;
 * LiveStatBand is for the single top-of-page "what's happening right now"
 * readout.
 */
export function LiveStatBand({ items, eyebrow = "Live now", className }: LiveStatBandProps) {
  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-5 shadow-sm", className)}>
      <div className="flex items-center gap-2">
        <PulseDot tone="green" size={7} />
        <p className="font-display text-xs font-bold uppercase tracking-wide text-ink-soft">{eyebrow}</p>
      </div>
      <div className="mt-3 flex flex-wrap divide-x divide-border">
        {items.map(({ label, value, icon: Icon, tone = "blue" }) => (
          <div key={label} className="min-w-[7.5rem] flex-1 px-4 py-2 first:pl-0 last:pr-0">
            <Icon size={16} strokeWidth={2} className={cn("mb-1.5", TONE_FG[tone])} />
            <p className="font-meter text-2xl font-semibold tabular-nums text-ink">{value}</p>
            <p className="mt-0.5 text-xs text-ink-soft">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
