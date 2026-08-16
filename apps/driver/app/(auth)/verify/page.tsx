"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button, OtpInput } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { requestPhoneOtp, verifyPhoneOtp } from "@ride-it/auth";

const RESEND_SECONDS = 30;

function VerifyPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const phone = params.get("phone") ?? "";
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
      await verifyPhoneOtp(supabase, phone, code);
      // Driver PRD registration flow: Login -> Documents -> Verification ->
      // Subscription -> Dashboard. Every driver lands on /documents after
      // verifying for now; branching returning, already-verified drivers
      // straight to /dashboard depends on reading driver.verification_status
      // (business/domain data), which is out of scope for the auth-only
      // Phase 4 boundary — left as a Phase 5+ item, same as before.
      router.push("/documents");
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
      await requestPhoneOtp(supabase, phone, "driver");
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
          We sent a 6-digit code to <span className="font-medium text-ink">+91 {phone}</span>
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
