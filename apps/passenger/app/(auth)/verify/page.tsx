"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button, MeterValue, OtpInput } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { requestPhoneOtp, verifyPhoneOtp, requestEmailOtp, verifyEmailOtp } from "@ride-it/auth";
import { setRidePin, getMyRidePin, getPassengerProfile, isPassengerProfileComplete } from "@ride-it/data";

/** Part 2 — route into onboarding unless the profile is already complete (name/phone/email/DOB/gender all set). */
async function nextRouteAfterAuth(supabase: ReturnType<typeof getSupabaseBrowserClient>, userId: string): Promise<string> {
  const profile = await getPassengerProfile(supabase, userId);
  return profile && isPassengerProfileComplete(profile) ? "/home" : "/onboarding";
}

const RESEND_SECONDS = 30;
// A freshly-created auth account's created_at will be within a few
// seconds of "now" at verification time; a returning user's account is
// however old their account actually is. This threshold distinguishes
// "just signed up" (show the one-time Ride PIN reveal) from "logging
// back in" (go straight to Home) — Supabase Auth doesn't otherwise flag
// "this was a brand-new account" on the verifyOtp response.
const NEW_ACCOUNT_THRESHOLD_MS = 60_000;

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
  const [revealedPin, setRevealedPin] = React.useState<string | null>(null);

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
      const isNewAccount =
        !!result.user?.created_at && Date.now() - new Date(result.user.created_at).getTime() < NEW_ACCOUNT_THRESHOLD_MS;

      if (isNewAccount) {
        // A permanent Ride PIN was already generated server-side at
        // account creation (handle_new_auth_user trigger), but that
        // trigger predates the encrypted-storage mechanism
        // (20260821090100) and never persists a decryptable copy.
        // Calling setRidePin() here regenerates it once more, then
        // getMyRidePin() decrypts-and-returns the freshly-encrypted
        // copy — the PIN they see here IS their real, currently-active
        // Ride PIN from this point forward, not a preview. Same
        // set-then-get sequence Profile's "Change Ride PIN" uses.
        await setRidePin(supabase);
        setRevealedPin(await getMyRidePin(supabase));
        setVerifying(false);
        return;
      }

      if (!result.user) throw new Error("Verification succeeded but no user was returned.");
      router.push(await nextRouteAfterAuth(supabase, result.user.id));
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
        await requestEmailOtp(supabase, identifierValue, "passenger");
      } else {
        await requestPhoneOtp(supabase, identifierValue, "passenger");
      }
    } catch (e) {
      setError(true);
      setErrorMessage(e instanceof Error ? e.message : null);
    }
  }

  if (revealedPin) {
    return (
      <main className="flex flex-1 flex-col justify-between px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <h1 className="font-display text-2xl font-medium text-ink">Your Ride PIN</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Your Ride PIN is used to start your rides. Tell it only to your assigned driver when they arrive.
          </p>
          <div className="mt-8 flex justify-center">
            <MeterValue value={revealedPin} size="lg" />
          </div>
          <p className="mt-6 text-center text-xs text-ink-soft">
            Remember this PIN — for your security, we won&apos;t show it to you again. You can change it anytime
            from your Profile.
          </p>
        </motion.div>
        <Button className="w-full" onClick={() => router.push("/onboarding")}>
          Got it
        </Button>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col justify-between px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="font-display text-2xl font-medium text-ink">Enter the code</h1>
        <p className="mt-2 text-sm text-ink-soft">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-ink">
            {identifierType === "email" ? identifierValue : `+91 ${identifierValue}`}
          </span>
        </p>

        <div className="mt-8">
          <OtpInput
            length={6}
            value={otp}
            onChange={setOtp}
            onComplete={handleComplete}
            error={error}
            disabled={verifying}
          />
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
            <button
              onClick={handleResend}
              className="text-sm font-medium text-signal-blue hover:underline"
            >
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

// useSearchParams() requires a Suspense boundary in the Next.js App Router
// (build fails/deopts without one) — fallback is null since this screen
// renders almost instantly and a loading flash would be worse than a brief blank.
export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyPageContent />
    </Suspense>
  );
}
