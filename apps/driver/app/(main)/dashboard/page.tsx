"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { OnlineToggle, MeterValue, Skeleton, StatusPill, Button, WalletIcon, RideIcon } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { VehicleType } from "@ride-it/types";
import { watchDriverLocation, LOCATION_CONFIG } from "@ride-it/maps";
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
  isDriverPersonalInfoComplete,
  getActiveVehicle,
  type DriverProfileRow,
  type SubscriptionRow,
  type RideOfferRow,
} from "@ride-it/data";
import { RideRequestSheet } from "../../../components/ride-request-sheet";

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(fullName: string | null | undefined): string {
  return fullName?.trim().split(/\s+/)[0] || "Driver";
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
  const [loadError, setLoadError] = React.useState(false);

  const loadAll = React.useCallback(async () => {
    if (!user) return;
    setLoadError(false);
    try {
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
    } catch {
      setLoadError(true);
    }
  }, [supabase, user]);

  React.useEffect(() => {
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  // Defensive re-check, same reasoning as Passenger Home: the verify
  // screen's routing is the primary onboarding gate, this closes the gap
  // for any path that reaches Dashboard directly with incomplete personal
  // info or no active vehicle on file.
  React.useEffect(() => {
    if (!user) return;
    Promise.all([getDriverProfile(supabase, user.id), getActiveVehicle(supabase, user.id)]).then(([p, vehicle]) => {
      if (!p || !isDriverPersonalInfoComplete(p) || !vehicle) router.replace("/onboarding");
    });
  }, [supabase, user, router]);

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

  // Location reporting while online but not yet on a ride. Real device GPS
  // via navigator.geolocation.watchPosition() (packages/maps/geolocation.ts)
  // — the previous version of this effect wrote a single fixed coordinate
  // on every tick, which the server-authoritative location_updated_at
  // trigger (20260813090500) correctly never treated as "fresh" for an
  // unchanging value. watchDriverLocation()'s dev-only simulated-movement
  // fallback (real GPS unavailable AND NODE_ENV !== "production" only —
  // compiled out of production builds entirely) produces a genuinely
  // moving position instead, so freshness can actually be maintained in a
  // no-GPS dev/test environment without weakening the freshness check
  // itself. Same ONLINE_PING_INTERVAL_MS cadence as before this change.
  React.useEffect(() => {
    if (!user || !profile?.is_online) return;
    const stopWatching = watchDriverLocation({
      minIntervalMs: LOCATION_CONFIG.ONLINE_PING_INTERVAL_MS,
      onUpdate: (pos) => {
        updateDriverLocation(supabase, user.id, pos).catch(() => {
          // A single failed write isn't fatal — the watcher's next
          // accepted update will retry naturally.
        });
      },
      onError: () => {
        // Honest degradation only — watchDriverLocation's own dev-only
        // fallback already covers "no real GPS in this environment";
        // nothing further to do here on the Dashboard's lighter ping.
      },
    });
    return stopWatching;
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
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-14 w-48" />
        <Skeleton className="mt-6 h-24 w-full rounded-2xl" />
        <Skeleton className="mt-6 h-8 w-full rounded-lg" />
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-8">
      {loadError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-alert-red/30 bg-alert-red/5 px-4 py-3 text-sm text-alert-red">
          <span>Couldn't load your dashboard.</span>
          <button type="button" onClick={() => loadAll()} className="font-medium underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      {/* Header: quiet greeting + subscription status, no card chrome. */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">
            {greeting()}, {firstName(profile?.full_name)}
          </p>
          {subscription && (
            <p className="mt-0.5 text-xs text-ink-soft">
              {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)} plan · expires in{" "}
              {daysUntil(subscription.expires_at)} days
            </p>
          )}
        </div>
        <StatusPill tone={subscription ? "verified" : "alert"} className="shrink-0">
          {subscription ? "Active" : "Inactive"}
        </StatusPill>
      </div>

      {/* HERO: today's earnings — the driver's #1 question, answered first
          and biggest. Deliberately bare (no card border/shadow) so scale
          and weight alone carry the hierarchy. */}
      <div className="mt-5">
        <p className="font-display text-xs font-bold uppercase tracking-wide text-marigold-text">Today&apos;s earnings</p>
        <MeterValue
          value={`₹${earningsToday.total}`}
          size="lg"
          className="mt-1 [&>div]:text-6xl [&>div]:font-semibold [&>div]:text-ink"
        />
      </div>

      {/* Online control — the second focal point. */}
      <OnlineToggle
        online={!!profile?.is_online}
        disabled={togglingOnline || (!subscription && !profile?.is_online)}
        loading={togglingOnline}
        subtitle={
          !subscription
            ? "Subscribe to start accepting rides"
            : profile?.is_online
              ? "Looking for rides nearby…"
              : "Tap to start receiving ride requests"
        }
        onToggle={handleToggleOnline}
        className="mt-6"
      />

      {!subscription && (
        <Button
          variant="marigold"
          className="mt-3 w-full"
          onClick={() => router.push("/subscription")}
        >
          View subscription plans
        </Button>
      )}

      {/* Compact single-line "today" strip — three quick facts, not three
          more equal-weight cards. */}
      <div className="mt-6 flex items-center justify-center gap-2.5 border-t border-border pt-4 text-sm text-ink-soft">
        <span className="flex items-center gap-1.5 font-medium text-ink">
          <RideIcon size={14} className="text-signal-blue" aria-hidden="true" />
          {earningsToday.rides} rides
        </span>
        <span aria-hidden="true">·</span>
        <span className="flex items-center gap-1.5 font-medium text-ink">
          <WalletIcon size={14} className="text-marigold-text" aria-hidden="true" />₹{walletBalance}
        </span>
        <span aria-hidden="true">·</span>
        <span className="flex items-center gap-1.5 font-medium text-ink">
          <Star size={14} className="fill-marigold text-marigold" aria-hidden="true" />
          {(profile?.rating ?? 5).toFixed(1)}
        </span>
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
