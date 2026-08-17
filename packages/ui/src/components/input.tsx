import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const inputVariants = cva(
  "w-full rounded-lg border bg-white px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft/70 disabled:cursor-not-allowed disabled:opacity-50",
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

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {
  label?: string;
  error?: string;
  hint?: string;
}

let idCounter = 0;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, state, label, error, hint, id, ...props }, ref) => {
    const generatedId = React.useId ? React.useId() : `ridit-input-${++idCounter}`;
    const inputId = id ?? generatedId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(inputVariants({ size, state: error ? "error" : state }), className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(hintId, errorId) || undefined}
          {...props}
        />
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
Input.displayName = "Input";
