import * as React from "react";
import { cn } from "../lib/cn";

const CARD_TONE_CLASSES = {
  default: "border-border bg-surface",
  tinted: "border-transparent bg-tint-blue",
  elevated: "border-transparent bg-surface shadow-md",
  outline: "border-border bg-transparent shadow-none",
} as const;

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Set true for cards that act as a button/link — adds hover lift + pointer cursor */
  interactive?: boolean;
  /** Visual weight — default (bordered white), tinted (brand-tint fill, no border), elevated (shadow-forward), outline (no fill/shadow) */
  tone?: keyof typeof CARD_TONE_CLASSES;
  /** Solid color strip down the left edge — used for stat/status cards that need to be told apart at a glance */
  accent?: "blue" | "marigold" | "green" | "red" | "violet";
}

const ACCENT_CLASSES: Record<NonNullable<CardProps["accent"]>, string> = {
  blue: "border-l-4 border-l-signal-blue",
  marigold: "border-l-4 border-l-marigold",
  green: "border-l-4 border-l-meter-green",
  red: "border-l-4 border-l-alert-red",
  violet: "border-l-4 border-l-violet",
};

export function Card({ className, interactive, tone = "default", accent, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 shadow-sm transition-all duration-150",
        CARD_TONE_CLASSES[tone],
        accent && ACCENT_CLASSES[accent],
        interactive && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:translate-y-0",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-3 flex items-center justify-between gap-2", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-base font-medium text-ink", className)} {...props} />;
}
