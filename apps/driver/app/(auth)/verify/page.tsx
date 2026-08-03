"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button, OtpInput } from "@ride-it/ui";

const RESEND_SECONDS = 30;

export default function VerifyPage() {
  const router = useRouter();
  const params = useSearchParams();
  const phone = params.get("phone") ?? "";

  const [otp, setOtp] = React.useState("");
  const [error, setError] = React.useState(false);
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
    // TODO: wire to @ride-it/api-client -> POST /auth/otp/verify
    await new Promise((r) => setTimeout(r, 500));
    const isCorrect = code.length === 6; // placeholder until API wired
    if (isCorrect) {
      // Driver PRD registration flow: Login -> Documents -> Verification ->
      // Subscription -> Dashboard. New drivers land on /documents; existing
      // verified drivers would be routed straight to /dashboard once the
      // driver-status check is wired to the API.
      router.push("/documents");
    } else {
      setError(true);
      setVerifying(false);
    }
  }

  async function handleResend() {
    setSecondsLeft(RESEND_SECONDS);
    setOtp("");
    setError(false);
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
              That code didn&apos;t match. Check the digits and try again.
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
