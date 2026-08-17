import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/cn";

const selectVariants = cva(
  "w-full appearance-none rounded-lg border bg-surface pl-4 pr-9 text-sm text-ink outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        sm: "h-9 text-sm",
        md: "h-11",
        lg: "h-12 text-base",
      },
      state: {
        default: "border-border focus:border-signal-blue",
        error: "border-alert-red focus:border-alert-red",
      },
    },
    defaultVariants: { size: "lg", state: "default" },
  }
);

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size">,
    VariantProps<typeof selectVariants> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, size, state, label, error, hint, id, children, ...props }, ref) => {
    const generatedId = React.useId();
    const selectId = id ?? generatedId;
    const hintId = hint ? `${selectId}-hint` : undefined;
    const errorId = error ? `${selectId}-error` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-ink">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(selectVariants({ size, state: error ? "error" : state }), className)}
            aria-invalid={error ? true : undefined}
            aria-describedby={cn(hintId, errorId) || undefined}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft"
            aria-hidden="true"
          />
        </div>
        {hint && !error && (
          <p id={hintId} className="mt-1.5 text-xs text-ink-soft">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="mt-1.5 text-xs text-alert-red">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";
