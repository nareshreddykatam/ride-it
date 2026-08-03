"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { Button, Card, MeterValue, StatusPill } from "@ride-it/ui";
import { RideStatus } from "@ride-it/types";
import { MockMap } from "../../../components/mock-map";

const STEPS: { status: RideStatus; label: string }[] = [
  { status: RideStatus.ACCEPTED, label: "Driver assigned" },
  { status: RideStatus.DRIVER_ARRIVING, label: "Arriving" },
  { status: RideStatus.OTP_VERIFIED, label: "OTP verified" },
  { status: RideStatus.RIDE_STARTED, label: "On the way" },
];

// Placeholder — wire to ridesApi.getRide(rideId) + Socket.IO live updates
const DEMO_RIDE = {
  otp: "4821",
  driverName: "Ramesh K.",
  vehicleLabel: "Auto · AP 09 XY 4521",
  rating: 4.8,
};

export default function RideStatusPage() {
  const params = useParams<{ id: string }>();
  const [stepIndex, setStepIndex] = React.useState(0);
  const [sosOpen, setSosOpen] = React.useState(false);

  // Simulate the driver progressing through the ride over time.
  React.useEffect(() => {
    if (stepIndex >= STEPS.length - 1) return;
    const t = setTimeout(() => setStepIndex((s) => s + 1), 2600);
    return () => clearTimeout(t);
  }, [stepIndex]);

  const progressPct = (stepIndex / (STEPS.length - 1)) * 100;
  const canCancel = stepIndex < 2; // policy: cancellable up to OTP verification / driver arrival

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <div className="relative">
        <MockMap variant="live" progress={0.15 + stepIndex * 0.28} className="h-48" />
        <button
          onClick={() => setSosOpen(true)}
          className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-alert-red px-3 py-1.5 text-xs font-medium text-white shadow-md"
        >
          <AlertTriangle size={13} /> SOS
        </button>
      </div>

      <div className="mt-6">
        <div className="h-1 w-full overflow-hidden rounded-full bg-ink/10">
          <motion.div
            className="h-full rounded-full bg-signal-blue"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
        <div className="mt-2 flex justify-between">
          {STEPS.map((step, i) => (
            <span
              key={step.status}
              className={`text-[11px] ${i <= stepIndex ? "text-signal-blue" : "text-ink-soft"}`}
            >
              {step.label}
            </span>
          ))}
        </div>
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-base font-medium text-ink">{DEMO_RIDE.driverName}</p>
            <p className="text-xs text-ink-soft">{DEMO_RIDE.vehicleLabel} · ★ {DEMO_RIDE.rating}</p>
          </div>
          <StatusPill tone="online">{STEPS[stepIndex].label}</StatusPill>
        </div>
      </Card>

      <Card className="mt-4">
        <p className="text-xs text-ink-soft">Share this OTP with your driver to start the ride</p>
        <div className="mt-2 flex justify-center">
          <MeterValue value={DEMO_RIDE.otp} size="lg" />
        </div>
      </Card>

      <div className="mt-auto flex flex-col gap-2 pt-6">
        {canCancel && (
          <button className="text-center text-sm font-medium text-alert-red">
            Cancel ride
          </button>
        )}
        <Link href={`/ride/${params.id}/complete`}>
          <Button variant="outline" className="w-full">
            Continue (demo: ride completed)
          </Button>
        </Link>
      </div>

      {sosOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 px-6 pb-8"
          onClick={() => setSosOpen(false)}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-md rounded-xl bg-white p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <AlertTriangle size={28} className="mx-auto text-alert-red" />
            <p className="mt-2 font-display text-lg font-medium text-ink">Emergency SOS</p>
            <p className="mt-1 text-sm text-ink-soft">
              Full emergency-contact and authority-integration flow is pending
              PRD confirmation — this is a placeholder confirmation only.
            </p>
            <Button variant="destructive" className="mt-4 w-full" onClick={() => setSosOpen(false)}>
              Close
            </Button>
          </motion.div>
        </motion.div>
      )}
    </main>
  );
}
