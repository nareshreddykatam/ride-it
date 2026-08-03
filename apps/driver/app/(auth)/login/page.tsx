"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@ride-it/ui";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const isValid = /^[6-9]\d{9}$/.test(phone);

  async function handleContinue() {
    if (!isValid) return;
    setSubmitting(true);
    // TODO: wire to @ride-it/api-client -> POST /auth/otp/request
    await new Promise((r) => setTimeout(r, 400));
    router.push(`/verify?phone=${phone}`);
  }

  return (
    <main className="flex flex-1 flex-col justify-between px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <p className="font-display text-sm font-medium text-ink-blue">Ride It Driver</p>
        <h1 className="mt-2 font-display text-3xl font-medium leading-tight text-ink">
          Keep 100%
          <br />
          of every fare.
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          Enter your mobile number to sign in or register as a driver.
        </p>

        <div className="mt-8">
          <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-ink">
            Mobile number
          </label>
          <div className="flex items-center rounded-lg border border-border bg-white focus-within:border-ink-blue focus-within:ring-2 focus-within:ring-ink-blue/20">
            <span className="pl-4 pr-2 font-meter text-sm text-ink-soft">+91</span>
            <input
              id="phone"
              inputMode="numeric"
              maxLength={10}
              autoFocus
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className="h-14 w-full bg-transparent pr-4 font-meter text-base tracking-wide text-ink outline-none"
            />
          </div>
          {phone.length > 0 && !isValid && (
            <p className="mt-1.5 text-xs text-alert-red">Enter a valid 10-digit mobile number.</p>
          )}
        </div>
      </motion.div>

      <div>
        <Button className="w-full" disabled={!isValid || submitting} onClick={handleContinue}>
          {submitting ? "Sending code…" : "Continue"}
        </Button>
        <p className="mt-3 text-center text-xs text-ink-soft">
          By continuing, you agree to Ride It&apos;s Driver Terms and Privacy Policy.
        </p>
      </div>
    </main>
  );
}
