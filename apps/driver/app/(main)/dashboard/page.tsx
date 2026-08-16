"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Card, MeterValue, Skeleton, StatusPill, cn } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { VehicleType } from "@ride-it/types";
import {
  getDriverProfile,
  getActiveSubscription,
  setDriverOnlineStatus,
  updateDriverLocation,
  getDriverEarningsSummary,
  getWallet,
  getActiveOfferForDriver,
  acceptRideRequest,
  rejectRideRequest,
  subscribeToDriverOffers,
  type DriverProfileRow,
  type SubscriptionRow,
  type RideOfferRow,
} from "@ride-it/data";
import { RideRequestSheet } from "../../../components/ride-request-sheet";

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

// No real GPS/maps integration this phase (explicitly out of scope) — uses
// the browser's Geolocation API when available (a device capability, not a
// maps service) so real coordinates flow into matching where possible,
// falling back to a fixed demo point otherwise. Same honest-boundary
// pattern used everywhere else location has come up in this project.
const DEMO_LOCATION = { lat: 17.385, lng: 78.4867 };
const LOCATION_PING_INTERVAL_MS = 20000;

function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(DEMO_LOCATION);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(DEMO_LOCATION),
      { timeout: 5000 }
    );
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const [loading, setLoading] = React.useState(true);
  const [profile, setProfile] = React.useState<DriverProfileRow | null>(null);
  const [subscription, setSubscription] = React.useState<SubscriptionRow | null>(null);
  const [earningsToday, setEarningsToday] = React.useState({ total: 0, rides: 0 });
  const [walletBalance, setWalletBalance] = React.useState(0);
  const [togglingOnline, setTogglingOnline] = React.useState(false);
  const [pendingOffer, setPendingOffer] = React.useState<RideOfferRow | null>(null);
  const [requestOpen, setRequestOpen] = React.useState(false);

  const loadAll = React.useCallback(async () => {
    if (!user) return;
    const [driverProfile, activeSub, earnings, wallet] = await Promise.all([
      getDriverProfile(supabase, user.id),
      getActiveSubscription(supabase, user.id),
      getDriverEarningsSummary(supabase, user.id, "today"),
      getWallet(supabase, user.id),
    ]);
    setProfile(driverProfile);
    setSubscription(activeSub);
    setEarningsToday({ total: earnings.totalEarnings, rides: earnings.ridesCompleted });
    setWalletBalance(wallet?.balance ?? 0);
  }, [supabase, user]);

  React.useEffect(() => {
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  // Reconcile against authoritative state on mount/reconnect — if a
  // realtime event was missed while this screen wasn't open, this catches
  // an already-pending offer rather than relying solely on the stream.
  React.useEffect(() => {
    if (!user) return;
    getActiveOfferForDriver(supabase, user.id).then((offer) => {
      if (offer) {
        setPendingOffer(offer);
        setRequestOpen(true);
      }
    });
  }, [supabase, user]);

  // Real-time: subscribe to new offers made to this driver. Filtered to
  // this driver's own id — not a broadcast-all subscription.
  React.useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToDriverOffers(supabase, user.id, (offer) => {
      if (offer.status === "pending") {
        setPendingOffer(offer);
        setRequestOpen(true);
      }
    });
    return unsubscribe;
  }, [supabase, user]);

  // Location reporting while online — see getCurrentPosition() above for
  // the real-GPS-with-demo-fallback approach.
  React.useEffect(() => {
    if (!user || !profile?.is_online) return;
    let active = true;
    async function ping() {
      const pos = await getCurrentPosition();
      if (active && user) await updateDriverLocation(supabase, user.id, pos);
    }
    ping();
    const interval = setInterval(ping, LOCATION_PING_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [supabase, user, profile?.is_online]);

  async function handleToggleOnline() {
    if (!user || !profile) return;
    if (!subscription && !profile.is_online) return; // can't go online without an active subscription
    setTogglingOnline(true);
    try {
      const next = !profile.is_online;
      await setDriverOnlineStatus(supabase, user.id, next);
      setProfile({ ...profile, is_online: next });
    } catch {
      // Server-side enforce_driver_online_requires_subscription (Phase
      // 6.1) rejects this if the subscription check fails at the DB
      // level too — surfacing nothing further here is acceptable since
      // the button is already disabled in that case.
    } finally {
      setTogglingOnline(false);
    }
  }

  async function handleAccept() {
    if (!pendingOffer) return;
    setRequestOpen(false);
    const claimed = await acceptRideRequest(supabase, pendingOffer.ride_id);
    if (claimed) {
      router.push(`/navigation?rideId=${claimed.id}`);
    }
    // If claimed is null, the race was lost (another driver got it first)
    // or the offer expired — accept_ride_offer() already marked this
    // driver's own offer row accordingly server-side.
    setPendingOffer(null);
  }

  async function handleReject() {
    if (!pendingOffer) return;
    setRequestOpen(false);
    try {
      await rejectRideRequest(supabase, pendingOffer.ride_id);
    } finally {
      setPendingOffer(null);
    }
  }

  if (loading) {
    return (
      <main className="flex-1 px-6 py-8">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-6 h-24 w-full rounded-xl" />
        <div className="mt-6 grid grid-cols-2 gap-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-ink-soft">Subscription</p>
          <p className="font-display text-sm font-medium text-ink">
            {subscription
              ? `${subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)} — expires in ${daysUntil(subscription.expires_at)} days`
              : "No active subscription"}
          </p>
        </div>
        <StatusPill tone={subscription ? "online" : "alert"}>{subscription ? "Active" : "Inactive"}</StatusPill>
      </div>

      <motion.button
        onClick={handleToggleOnline}
        disabled={togglingOnline || (!subscription && !profile?.is_online)}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "mt-6 flex w-full flex-col items-center justify-center gap-1 rounded-xl py-8 transition-colors disabled:opacity-60",
          profile?.is_online ? "bg-meter-green text-white" : "bg-ink text-white"
        )}
      >
        <span className="font-display text-xl font-medium">
          {profile?.is_online ? "You're online" : "Go online"}
        </span>
        <span className="text-xs opacity-80">
          {!subscription
            ? "Subscribe to start accepting rides"
            : profile?.is_online
              ? "Looking for rides nearby…"
              : "Tap to start receiving ride requests"}
        </span>
      </motion.button>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <Card>
          <MeterValue value={`₹${earningsToday.total}`} label="Earned today" size="lg" />
          <p className="mt-2 text-xs text-ink-soft">{earningsToday.rides} rides completed</p>
        </Card>
        <Card>
          <MeterValue value={`₹${walletBalance}`} label="Wallet balance" size="lg" />
          <p className="mt-2 text-xs text-ink-soft">Available to withdraw</p>
        </Card>
      </div>

      {pendingOffer && (
        <RideRequestSheet
          open={requestOpen}
          pickup={{ lat: 0, lng: 0, address: pendingOffer.pickup_address ?? "Pickup" }}
          drop={{ lat: 0, lng: 0, address: pendingOffer.drop_address ?? "Drop" }}
          expiresAt={pendingOffer.expires_at}
          fare={{
            vehicleType: pendingOffer.vehicle_type === "bike" ? VehicleType.BIKE : VehicleType.AUTO,
            baseFare: pendingOffer.base_fare,
            distanceFare: pendingOffer.distance_fare,
            totalFare: pendingOffer.total_fare,
            currency: "INR",
            distanceKm: pendingOffer.distance_km ?? 0,
            etaMinutes: 5,
          }}
          onAccept={handleAccept}
          onReject={handleReject}
          onExpire={handleReject}
        />
      )}
    </main>
  );
}
