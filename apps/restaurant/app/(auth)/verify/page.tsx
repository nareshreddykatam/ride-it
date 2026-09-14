"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button, OtpInput, PageLoader } from "@ride-it/ui";
import { ShieldCheck } from "lucide-react";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { requestPhoneOtp, verifyPhoneOtp, requestEmailOtp, verifyEmailOtp } from "@ride-it/auth";
import { ensureRestaurantOwnerProfile } from "@ride-it/data";

const RESEND_SECONDS = 30;

function VerifyPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const identifierType = params.get("type") === "email" ? "email" : "phone";
  const identifierValue = params.get("value") ?? "";
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const [otp, setOtp] = React.useState("");
  const [error, setError] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [secondsLeft, setSecondsLeft] = React.useState(RESEND_SECONDS);

  React.useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  async function handleComplete(code: string) {
    setVerifying(true);
    setError(false);
    setErrorMessage(null);
    try {
      const result =
        identifierType === "email"
          ? await verifyEmailOtp(supabase, identifierValue, code)
          : await verifyPhoneOtp(supabase, identifierValue, code);
      if (!result.user) throw new Error("Verification succeeded but no user was returned.");

      // Mirrors ensure_driver_profile()/ensure_passenger_profile() — this
      // identity may be brand new, or a returning passenger/driver opening
      // the Restaurant app for the first time; either way this creates the
      // restaurant_owners row if it doesn't already exist. The middleware
      // then routes to /onboarding (no restaurant yet) or /dashboard.
      await ensureRestaurantOwnerProfile(supabase);
      router.push("/dashboard");
    } catch (e) {
      setError(true);
      setErrorMessage(e instanceof Error ? e.message : null);
      setVerifying(false);
    }
  }

  async function handleResend() {
    setSecondsLeft(RESEND_SECONDS);
    setOtp("");
    setError(false);
    setErrorMessage(null);
    try {
      if (identifierType === "email") {
        await requestEmailOtp(supabase, identifierValue, "restaurant_owner");
      } else {
        await requestPhoneOtp(supabase, identifierValue, "restaurant_owner");
      }
    } catch (e) {
      setError(true);
      setErrorMessage(e instanceof Error ? e.message : null);
    }
  }

  return (
    <main className="flex flex-1 flex-col justify-between px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-tint-blue text-signal-blue">
          <ShieldCheck size={22} aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-medium text-ink">Enter the code</h1>
        <p className="mt-2 text-sm text-ink-soft">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-ink">{identifierType === "email" ? identifierValue : `+91 ${identifierValue}`}</span>
        </p>

        <div className="mt-8">
          <OtpInput length={6} value={otp} onChange={setOtp} onComplete={handleComplete} error={error} disabled={verifying} />
          {error && <p className="mt-2 text-xs text-alert-red">{errorMessage ?? "That code didn't match. Check the digits and try again."}</p>}
        </div>

        <div className="mt-6">
          {secondsLeft > 0 ? (
            <p className="font-meter text-sm text-ink-soft">Resend code in 00:{secondsLeft.toString().padStart(2, "0")}</p>
          ) : (
            <button onClick={handleResend} className="text-sm font-medium text-ink-blue hover:underline">
              Resend code
            </button>
          )}
        </div>
      </motion.div>

      <Button className="w-full" disabled={otp.length !== 6 || verifying} onClick={() => handleComplete(otp)}>
        {verifying ? "Verifying…" : "Verify & continue"}
      </Button>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <VerifyPageContent />
    </Suspense>
  );
}
