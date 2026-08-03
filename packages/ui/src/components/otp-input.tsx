"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../lib/cn";

export interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  error?: boolean;
  className?: string;
}

/**
 * The signature "meter digit" input — used for OTP entry, and restyled
 * (read-only) for live fare/earnings readouts. See DESIGN_SYSTEM.md.
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  autoFocus = true,
  disabled,
  error,
  className,
}: OtpInputProps) {
  const inputsRef = React.useRef<Array<HTMLInputElement | null>>([]);
  const digits = React.useMemo(() => {
    const arr = value.split("").slice(0, length);
    while (arr.length < length) arr.push("");
    return arr;
  }, [value, length]);

  const setDigit = (index: number, digit: string) => {
    const next = [...digits];
    next[index] = digit;
    const joined = next.join("");
    onChange(joined);
    if (digit && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
    if (joined.length === length && !joined.includes("")) {
      onComplete?.(joined);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (pasted) {
      e.preventDefault();
      onChange(pasted);
      if (pasted.length === length) onComplete?.(pasted);
      const focusIndex = Math.min(pasted.length, length - 1);
      inputsRef.current[focusIndex]?.focus();
    }
  };

  return (
    <div className={cn("flex gap-2", className)} role="group" aria-label="Verification code">
      {digits.map((digit, i) => (
        <div
          key={i}
          className={cn(
            "relative h-14 w-11 overflow-hidden rounded-lg border bg-white",
            error ? "border-alert-red" : "border-border",
            "focus-within:border-signal-blue focus-within:ring-2 focus-within:ring-signal-blue/20"
          )}
        >
          <AnimatePresence mode="popLayout">
            {digit && (
              <motion.span
                key={digit + i}
                initial={{ y: "-100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="pointer-events-none absolute inset-0 flex items-center justify-center font-meter text-xl text-ink"
              >
                {digit}
              </motion.span>
            )}
          </AnimatePresence>
          <input
            ref={(el) => { inputsRef.current[i] = el; }}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            autoFocus={autoFocus && i === 0}
            disabled={disabled}
            value=""
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, "").slice(-1);
              if (d) setDigit(i, d);
            }}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            className="absolute inset-0 h-full w-full cursor-text bg-transparent text-center opacity-0"
            aria-label={`Digit ${i + 1} of ${length}`}
          />
        </div>
      ))}
    </div>
  );
}
