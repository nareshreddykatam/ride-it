import * as React from "react";
import { cn } from "../lib/cn";

export interface PulseDotProps {
  tone?: "green" | "blue" | "red";
  size?: number;
  className?: string;
}

const TONE_BG: Record<NonNullable<PulseDotProps["tone"]>, string> = {
  green: "bg-meter-green",
  blue: "bg-signal-blue",
  red: "bg-alert-red",
};

/** A live/online indicator dot with an expanding ring — used next to "You're online", live driver counts, and any "this is happening right now" status. */
export function PulseDot({ tone = "green", size = 8, className }: PulseDotProps) {
  return (
    <span className={cn("relative inline-flex", className)} style={{ width: size, height: size }} aria-hidden="true">
      <span className={cn("absolute inset-0 animate-pulse-ring rounded-full", TONE_BG[tone])} />
      <span className={cn("relative inline-flex rounded-full", TONE_BG[tone])} style={{ width: size, height: size }} />
    </span>
  );
}
