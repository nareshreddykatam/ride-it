"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { OnlineToggle, MeterValue, Skeleton, StatCard, StatusPill, Button, WalletIcon, RideIcon } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { VehicleType } from "@ride-it/types";
import { watchDriverLocation, LOCATION_CONFIG, RideMap, type LatLng } from "@ride-it/maps";
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
  const [selfLocation, setSelfLocation] = React.useState<LatLng | null>(null);

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
        setSelfLocation(pos);
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
        <Skeleton className="-mx-6 -mt-8 h-48 rounded-none" />
        <Skeleton className="mt-6 h-4 w-32" />
        <Skeleton className="mt-4 h-14 w-48" />
        <Skeleton className="mt-6 h-16 w-full rounded-lg" />
        <Skeleton className="mt-6 h-8 w-full rounded-lg" />
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-8">
      {/* Map — real spatial context for the dashboard (~30% of the mobile
          viewport, bleeding edge-to-edge like Navigation's map), not a
          token strip. Shows the driver's live position while online and
          searching; a quiet static view otherwise. This is the screen's
          map real estate — everything below it is flat content by design. */}
      <div className="relative -mx-6 -mt-8 h-48 shrink-0">
        <RideMap
          driverLocation={selfLocation}
          fallbackVariant={profile?.is_online ? "searching" : "static"}
          className="h-full rounded-none border-0"
        />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <span className="flex items-center gap-1.5 rounded-full bg-surface/95 px-3 py-1.5 text-xs font-medium text-ink shadow-sm backdrop-blur-sm">
            <span
              className={`h-1.5 w-1.5 rounded-full ${profile?.is_online ? "bg-meter-green" : "bg-ink-soft"}`}
              aria-hidden="true"
            />
            {profile?.is_online ? "Looking for rides nearby" : "You're offline"}
          </span>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 mt-5 flex items-center justify-between rounded-lg border border-alert-red/30 bg-alert-red/5 px-4 py-3 text-sm text-alert-red">
          <span>Couldn't load your dashboard.</span>
          <button type="button" onClick={() => loadAll()} className="font-medium underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      {/* Header: quiet greeting + subscription status, no card chrome. */}
      <div className="mt-5 flex items-start justify-between gap-3">
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

      {/* Expiry warning — the header above already states "expires in N
          days" quietly at all times; this is the escalated, hard-to-miss
          version for when it's genuinely close, so a driver can't lose
          ride eligibility with zero warning. */}
      {subscription && daysUntil(subscription.expires_at) <= 3 && (
        <button
          type="button"
          onClick={() => router.push("/subscription")}
          className="mt-3 flex w-full items-center justify-between rounded-lg border border-marigold/40 bg-marigold/10 px-4 py-3 text-left"
        >
          <span className="text-sm font-medium text-marigold-text">
            {daysUntil(subscription.expires_at) === 0
              ? "Your subscription expires today"
              : `Your subscription expires in ${daysUntil(subscription.expires_at)} day${daysUntil(subscription.expires_at) === 1 ? "" : "s"}`}
          </span>
          <span className="shrink-0 text-xs font-semibold text-marigold-text underline underline-offset-2">Renew</span>
        </button>
      )}

      {/* Operational bento grid — today's trips, wallet, and rating as
          distinct scannable facts, each with its own icon/tone, instead of
          one run-together text line. Same real values as before. */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <StatCard label="Trips today" value={String(earningsToday.rides)} icon={RideIcon} tone="blue" />
        <StatCard label="Wallet balance" value={`₹${walletBalance}`} icon={WalletIcon} tone="marigold" />
        <StatCard
          label="Rating"
          value={(profile?.rating ?? 5).toFixed(1)}
          icon={Star}
          tone="green"
          className="col-span-2"
        />
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
            // The offer's base_fare/distance_fare are already surge-inclusive
            // (set from the ride's own server-computed values at dispatch
            // time) — this field isn't rendered by RideRequestSheet, kept
            // only to satisfy FareEstimate's shape.
            surgeMultiplier: 1,
          }}
          onAccept={handleAccept}
          onReject={handleReject}
          onExpire={handleReject}
        />
      )}
    </main>
  );
}
