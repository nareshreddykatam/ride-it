"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button, OtpInput } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { requestPhoneOtp, verifyPhoneOtp, requestEmailOtp, verifyEmailOtp } from "@ride-it/auth";
import { getDriverProfile, isDriverPersonalInfoComplete, getActiveVehicle } from "@ride-it/data";

const RESEND_SECONDS = 30;

function VerifyPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  // "type"/"value" replace the old phone-only "phone" param so this screen
  // works for either identifier — falls back to "phone" for any stale
  // bookmarked/cached link using the old query shape.
  const identifierType = params.get("type") === "email" ? "email" : "phone";
  const identifierValue = params.get("value") ?? params.get("phone") ?? "";
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
      // Driver PRD registration flow: Login -> Onboarding (personal info +
      // vehicle) -> Documents -> Verification -> Subscription -> Dashboard.
      // Onboarding is a one-time gate (Part 3): a driver whose personal
      // info and active vehicle are both already on file skips straight to
      // /documents, exactly as before this change for every returning,
      // already-onboarded driver.
      if (!result.user) throw new Error("Verification succeeded but no user was returned.");
      const [profile, vehicle] = await Promise.all([
        getDriverProfile(supabase, result.user.id),
        getActiveVehicle(supabase, result.user.id),
      ]);
      const needsOnboarding = !profile || !isDriverPersonalInfoComplete(profile) || !vehicle;
      router.push(needsOnboarding ? "/onboarding" : "/documents");
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
        await requestEmailOtp(supabase, identifierValue, "driver");
      } else {
        await requestPhoneOtp(supabase, identifierValue, "driver");
      }
    } catch (e) {
      setError(true);
      setErrorMessage(e instanceof Error ? e.message : null);
    }
  }

  return (
    <main className="flex flex-1 flex-col justify-between px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="font-display text-2xl font-medium text-ink">Enter the code</h1>
        <p className="mt-2 text-sm text-ink-soft">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-ink">
            {identifierType === "email" ? identifierValue : `+91 ${identifierValue}`}
          </span>
        </p>

        <div className="mt-8">
          <OtpInput length={6} value={otp} onChange={setOtp} onComplete={handleComplete} error={error} disabled={verifying} />
          {error && (
            <p className="mt-2 text-xs text-alert-red">
              {errorMessage ?? "That code didn\u2019t match. Check the digits and try again."}
            </p>
          )}
        </div>

        <div className="mt-6">
          {secondsLeft > 0 ? (
            <p className="font-meter text-sm text-ink-soft">
              Resend code in 00:{secondsLeft.toString().padStart(2, "0")}
            </p>
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

// useSearchParams() requires a Suspense boundary in the Next.js App Router.
export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyPageContent />
    </Suspense>
  );
}
