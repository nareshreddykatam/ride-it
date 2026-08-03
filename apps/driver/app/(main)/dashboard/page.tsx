"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Card, MeterValue, StatusPill, cn } from "@ride-it/ui";
import { RideRequestSheet } from "../../../components/ride-request-sheet";

// Placeholder data — wire to driverApi.getProfile()/getEarningsSummary()/getWallet()
const SUBSCRIPTION = { plan: "Monthly", expiresInDays: 12 };
const EARNINGS_TODAY = { total: 842, rides: 11 };
const WALLET_BALANCE = 3120;

// Placeholder incoming request — in production this arrives over Socket.IO
const SAMPLE_REQUEST = {
  pickup: { lat: 17.385, lng: 78.4867, address: "Banjara Hills Rd No. 12" },
  drop: { lat: 17.412, lng: 78.4483, address: "Hitech City, Madhapur" },
  fare: {
    vehicleType: "AUTO" as const,
    baseFare: 25,
    distanceFare: 63,
    totalFare: 88,
    currency: "INR" as const,
    distanceKm: 6.2,
    etaMinutes: 4,
  },
};

export default function DashboardPage() {
  const router = useRouter();
  const [isOnline, setIsOnline] = React.useState(false);
  const [requestOpen, setRequestOpen] = React.useState(false);

  // Demo only: simulate a ride request arriving shortly after going online.
  React.useEffect(() => {
    if (!isOnline) return;
    const t = setTimeout(() => setRequestOpen(true), 2500);
    return () => clearTimeout(t);
  }, [isOnline]);

  function handleAccept() {
    setRequestOpen(false);
    // TODO: driverApi.acceptRideRequest(rideId)
    router.push("/navigation");
  }

  function handleRejectOrExpire() {
    setRequestOpen(false);
    // TODO: driverApi.rejectRideRequest(rideId) — no strike, driver never accepted
  }

  return (
    <main className="flex-1 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-ink-soft">Subscription</p>
          <p className="font-display text-sm font-medium text-ink">
            {SUBSCRIPTION.plan} — expires in {SUBSCRIPTION.expiresInDays} days
          </p>
        </div>
        <StatusPill tone="online">Active</StatusPill>
      </div>

      <motion.button
        onClick={() => setIsOnline((v) => !v)}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "mt-6 flex w-full flex-col items-center justify-center gap-1 rounded-xl py-8 transition-colors",
          isOnline ? "bg-meter-green text-white" : "bg-ink text-white"
        )}
      >
        <span className="font-display text-xl font-medium">
          {isOnline ? "You're online" : "Go online"}
        </span>
        <span className="text-xs opacity-80">
          {isOnline ? "Looking for rides nearby…" : "Tap to start receiving ride requests"}
        </span>
      </motion.button>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <Card>
          <MeterValue value={`₹${EARNINGS_TODAY.total}`} label="Earned today" size="lg" />
          <p className="mt-2 text-xs text-ink-soft">{EARNINGS_TODAY.rides} rides completed</p>
        </Card>
        <Card>
          <MeterValue value={`₹${WALLET_BALANCE}`} label="Wallet balance" size="lg" />
          <p className="mt-2 text-xs text-ink-soft">Available to withdraw</p>
        </Card>
      </div>

      <p className="mt-8 text-xs text-ink-soft">
        Navigation, Earnings history, and Wallet detail screens are next —
        this page confirms the Go Online/Offline flow and demonstrates the
        ride-request sheet with its offer-window countdown.
      </p>

      <RideRequestSheet
        open={requestOpen}
        pickup={SAMPLE_REQUEST.pickup}
        drop={SAMPLE_REQUEST.drop}
        fare={SAMPLE_REQUEST.fare}
        onAccept={handleAccept}
        onReject={handleRejectOrExpire}
        onExpire={handleRejectOrExpire}
      />
    </main>
  );
}
