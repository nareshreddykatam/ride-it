"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { requestPhoneOtp, requestEmailOtp, detectIdentifier } from "@ride-it/auth";

export function LoginForm({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [input, setInput] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Single free-text field — detectIdentifier() decides email vs. phone
  // (same 10-digit shape the DB already enforces), so the passenger never
  // has to pick a tab before typing. See packages/auth/src/identifier.ts.
  const detected = detectIdentifier(input);
  const isValid = detected.type !== "invalid";

  async function handleContinue() {
    if (!isValid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (detected.type === "phone") {
        await requestPhoneOtp(supabase, detected.value, "passenger");
        router.push(`/verify?type=phone&value=${detected.value}`);
      } else {
        await requestEmailOtp(supabase, detected.value, "passenger");
        router.push(`/verify?type=email&value=${encodeURIComponent(detected.value)}`);
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't send the code. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col justify-between px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <p className="font-display text-sm font-medium text-signal-blue">Ride It</p>
        <h1 className="mt-2 font-display text-3xl font-medium leading-tight text-ink">
          Your ride.
          <br />
          Your way.
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          Enter your email or mobile number to book a Bike or Auto ride.
        </p>

        <div className="mt-8">
          <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium text-ink">
            Email or mobile number
          </label>
          <div className="flex items-center rounded-lg border border-border bg-white focus-within:border-signal-blue focus-within:ring-2 focus-within:ring-signal-blue/20">
            {detected.type === "phone" && <span className="pl-4 pr-2 font-meter text-sm text-ink-soft">+91</span>}
            <input
              id="identifier"
              inputMode="text"
              autoFocus
              autoComplete="username"
              placeholder="98765 43210 or you@example.com"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className={`h-14 w-full bg-transparent pr-4 text-base text-ink outline-none ${detected.type === "phone" ? "font-meter tracking-wide" : ""} ${detected.type !== "phone" ? "pl-4" : ""}`}
            />
          </div>
          {input.trim().length > 0 && !isValid && (
            <p className="mt-1.5 text-xs text-alert-red">Enter a valid 10-digit mobile number or email address.</p>
          )}
          {submitError && <p className="mt-1.5 text-xs text-alert-red">{submitError}</p>}
        </div>
      </motion.div>

      <div>
        <Button
          className="w-full"
          disabled={!isValid || submitting}
          onClick={handleContinue}
        >
          {submitting ? "Sending code…" : "Continue"}
        </Button>
        <p className="mt-3 text-center text-xs text-ink-soft">
          By continuing, you agree to Ride It&apos;s Terms and Privacy Policy.
        </p>
        {children}
      </div>
    </main>
  );
}
