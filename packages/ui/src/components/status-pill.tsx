import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const pillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      tone: {
        online: "bg-meter-green/10 text-meter-green",
        offline: "bg-ink-soft/10 text-ink-soft",
        pending: "bg-marigold/15 text-marigold",
        alert: "bg-alert-red/10 text-alert-red",
        info: "bg-signal-blue/10 text-signal-blue",
      },
    },
    defaultVariants: { tone: "info" },
  }
);

export interface StatusPillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {
  dot?: boolean;
}

export function StatusPill({ className, tone, dot = true, children, ...props }: StatusPillProps) {
  return (
    <span className={cn(pillVariants({ tone }), className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
