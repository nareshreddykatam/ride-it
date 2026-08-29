"use client";

import * as React from "react";
import { Input } from "@ride-it/ui";

export type DateRangePreset = "today" | "yesterday" | "7d" | "30d" | "custom";

export interface DateRangeValue {
  preset: DateRangePreset;
  start: Date;
  end: Date;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function rangeForPreset(preset: DateRangePreset, customStart?: Date, customEnd?: Date): { start: Date; end: Date } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { start: startOfDay(now), end: now };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case "7d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { start: startOfDay(start), end: now };
    }
    case "30d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { start: startOfDay(start), end: now };
    }
    case "custom":
      return { start: customStart ? startOfDay(customStart) : startOfDay(now), end: customEnd ? endOfDay(customEnd) : now };
  }
}

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom" },
];

export interface AdminDateRangeFilterProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}

/**
 * Shared date-range filter for every analytics page — one preset-pill row
 * (same interaction pattern as the Safety dashboard's status filter) plus
 * two native date inputs that only appear for "Custom". All range math
 * happens in rangeForPreset(); callers just pass the resulting start/end
 * straight to the admin_* RPCs as timestamptz bounds.
 */
export function AdminDateRangeFilter({ value, onChange }: AdminDateRangeFilterProps) {
  const [customStart, setCustomStart] = React.useState(() => value.start.toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = React.useState(() => value.end.toISOString().slice(0, 10));

  function selectPreset(preset: DateRangePreset) {
    if (preset === "custom") {
      const { start, end } = rangeForPreset("custom", new Date(customStart), new Date(customEnd));
      onChange({ preset, start, end });
      return;
    }
    const { start, end } = rangeForPreset(preset);
    onChange({ preset, start, end });
  }

  function applyCustom(startStr: string, endStr: string) {
    setCustomStart(startStr);
    setCustomEnd(endStr);
    if (!startStr || !endStr) return;
    const { start, end } = rangeForPreset("custom", new Date(startStr), new Date(endStr));
    onChange({ preset: "custom", start, end });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by date range">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="tab"
            aria-selected={value.preset === p.value}
            onClick={() => selectPreset(p.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              value.preset === p.value ? "bg-signal-blue text-white" : "bg-ink/5 text-ink-soft hover:bg-ink/10"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {value.preset === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            size="sm"
            type="date"
            aria-label="Start date"
            value={customStart}
            max={customEnd}
            onChange={(e) => applyCustom(e.target.value, customEnd)}
            className="w-36"
          />
          <span className="text-xs text-ink-soft">to</span>
          <Input
            size="sm"
            type="date"
            aria-label="End date"
            value={customEnd}
            min={customStart}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => applyCustom(customStart, e.target.value)}
            className="w-36"
          />
        </div>
      )}
    </div>
  );
}
