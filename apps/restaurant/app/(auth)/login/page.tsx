"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Store } from "lucide-react";
import { Button, PageLoader } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { requestPhoneOtp, requestEmailOtp, detectIdentifier } from "@ride-it/auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [input, setInput] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(
    searchParams.get("error") === "wrong_app" ? "That account can't be used to sign in here." : null
  );

  const detected = detectIdentifier(input);
  const isValid = detected.type !== "invalid";

  async function handleContinue() {
    if (!isValid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (detected.type === "phone") {
        await requestPhoneOtp(supabase, detected.value, "restaurant_owner");
        router.push(`/verify?type=phone&value=${detected.value}`);
      } else {
        await requestEmailOtp(supabase, detected.value, "restaurant_owner");
        router.push(`/verify?type=email&value=${encodeURIComponent(detected.value)}`);
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't send the code. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col justify-between px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-tint-blue text-signal-blue">
          <Store size={24} aria-hidden="true" />
        </span>
        <p className="mt-4 font-display text-sm font-medium text-ink-blue">Ridora Food — Restaurant Partner</p>
        <h1 className="mt-2 font-display text-3xl font-medium leading-tight text-ink">
          Grow your restaurant
          <br />
          with Ridora.
        </h1>
        <p className="mt-3 text-sm text-ink-soft">Enter your email or mobile number to sign in or register your restaurant.</p>

        <div className="mt-8">
          <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium text-ink">
            Email or mobile number
          </label>
          <div className="flex items-center rounded-lg border border-border bg-surface focus-within:border-ink-blue focus-within:ring-2 focus-within:ring-ink-blue/20">
            {detected.type === "phone" && <span className="pl-4 pr-2 font-meter text-sm text-ink-soft">+91</span>}
            <input
              id="identifier"
              inputMode="text"
              autoFocus
              autoComplete="username"
              placeholder="98765 43210 or you@restaurant.com"
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
        <Button className="w-full" disabled={!isValid || submitting} onClick={handleContinue}>
          {submitting ? "Sending code..." : "Continue"}
        </Button>
        <p className="mt-3 text-center text-xs text-ink-soft">
          Your restaurant will go live only after Ridora reviews and approves your application.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <LoginForm />
    </Suspense>
  );
}
