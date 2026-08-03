"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button, Card, MeterValue, OtpInput, StatusPill } from "@ride-it/ui";

type Phase = "TO_PICKUP" | "VERIFY_OTP" | "TO_DROP" | "SUMMARY";

// Placeholder — wire to ridesApi.getRide(rideId) + Socket.IO location updates
const DEMO_RIDE = {
  passengerName: "Priya S.",
  pickup: "Banjara Hills Rd No. 12",
  drop: "Hitech City, Madhapur",
  correctOtp: "4821",
  fare: 88,
};

export default function NavigationPage() {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("TO_PICKUP");
  const [otp, setOtp] = React.useState("");
  const [otpError, setOtpError] = React.useState(false);

  function handleOtpComplete(code: string) {
    if (code === DEMO_RIDE.correctOtp) {
      setOtpError(false);
      setPhase("TO_DROP");
    } else {
      setOtpError(true);
    }
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <div className="rounded-xl border border-border bg-white p-6">
        <p className="text-xs text-ink-soft">Live map</p>
        <div className="mt-3 flex h-40 items-center justify-center rounded-lg bg-ink/5 text-xs text-ink-soft">
          Turn-by-turn navigation (Google Maps) — next build pass
        </div>
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-base font-medium text-ink">{DEMO_RIDE.passengerName}</p>
            <p className="text-xs text-ink-soft">
              {phase === "TO_PICKUP" || phase === "VERIFY_OTP" ? DEMO_RIDE.pickup : DEMO_RIDE.drop}
            </p>
          </div>
          <StatusPill tone="info">
            {phase === "TO_PICKUP" && "Heading to pickup"}
            {phase === "VERIFY_OTP" && "Enter rider OTP"}
            {phase === "TO_DROP" && "Ride in progress"}
            {phase === "SUMMARY" && "Completed"}
          </StatusPill>
        </div>
      </Card>

      {phase === "TO_PICKUP" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-auto pt-8">
          <Button className="w-full" onClick={() => setPhase("VERIFY_OTP")}>
            I&apos;ve arrived — enter OTP
          </Button>
        </motion.div>
      )}

      {phase === "VERIFY_OTP" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
          <p className="text-sm font-medium text-ink">Ask the rider for their 4-digit OTP</p>
          <div className="mt-3">
            <OtpInput length={4} value={otp} onChange={setOtp} onComplete={handleOtpComplete} error={otpError} />
          </div>
          {otpError && <p className="mt-2 text-xs text-alert-red">That OTP doesn&apos;t match. Try again.</p>}
        </motion.div>
      )}

      {phase === "TO_DROP" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-auto pt-8">
          <Button className="w-full" onClick={() => setPhase("SUMMARY")}>
            Complete ride
          </Button>
        </motion.div>
      )}

      {phase === "SUMMARY" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-auto pt-8 text-center">
          <MeterValue value={`₹${DEMO_RIDE.fare}`} label="Fare collected" size="lg" className="items-center" />
          <Button className="mt-6 w-full" onClick={() => router.push("/dashboard")}>
            Back to dashboard
          </Button>
        </motion.div>
      )}
    </main>
  );
}
