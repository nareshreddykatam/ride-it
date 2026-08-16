"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "../lib/cn";

export interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  size?: number;
  className?: string;
}

export function StarRating({ value, onChange, readOnly, size = 32, className }: StarRatingProps) {
  const [hovered, setHovered] = React.useState<number | null>(null);
  const display = hovered ?? value;

  return (
    <div className={cn("flex items-center gap-1", className)} role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onMouseEnter={() => !readOnly && setHovered(n)}
          onMouseLeave={() => !readOnly && setHovered(null)}
          onClick={() => onChange?.(n)}
          className={cn("transition-transform", !readOnly && "hover:scale-110")}
        >
          <Star
            size={size}
            className={display >= n ? "fill-marigold text-marigold" : "fill-transparent text-ink/20"}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}
