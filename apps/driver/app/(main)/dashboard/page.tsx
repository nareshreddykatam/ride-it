"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { OnlineToggle, MeterValue, Skeleton, StatCard, StatusPill, Button, Card, WalletIcon, RideIcon } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { VehicleType } from "@ride-it/types";
import { watchDriverLocation, LOCATION_CONFIG, RideMap, fetchEta, type LatLng } from "@ride-it/maps";
import {
  getDriverProfile,
  getActiveSubscription,
  setDriverOnlineStatus,
  updateDriverLocation,
  getDriverEarningsSummary,
  getWallet,
  getActiveOffersForDriver,
  getRideOfferPickupLocation,
  acceptRideRequest,
  rejectRideRequest,
  subscribeToDriverOffers,
  subscribeToDriverOfferUpdates,
  isDriverPersonalInfoComplete,
  getActiveVehicle,
  type DriverProfileRow,
  type SubscriptionRow,
  type RideOfferRow,
  type VehicleRow,
} from "@ride-it/data";
import { RideRequestSheet, type RideOfferItem } from "../../../components/ride-request-sheet";

/**
 * Maps a raw ride_offers row to the shape RideRequestSheet renders.
 * pickupDistanceKm comes straight from the real PostGIS distance already
 * computed at dispatch time (distance_to_pickup_meters) — previously
 * fetched and silently discarded here. pickupEtaMinutes is NOT derived
 * here (this mapper has no async capability) — it's populated separately,
 * per-offer, by the effect below once a real Routes API ETA lands; until
 * then it's null and the card honestly shows distance-only.
 */
function toOfferItem(offer: RideOfferRow, pickupEtaMinutes: number | null): RideOfferItem {
  return {
    id: offer.id,
    rideId: offer.ride_id,
    pickup: { lat: 0, lng: 0, address: offer.pickup_address ?? "Pickup" },
    drop: { lat: 0, lng: 0, address: offer.drop_address ?? "Drop" },
    expiresAt: offer.expires_at,
    pickupDistanceKm: offer.distance_to_pickup_meters != null ? offer.distance_to_pickup_meters / 1000 : null,
    pickupEtaMinutes,
    fare: {
      vehicleType: offer.vehicle_type === "bike" ? VehicleType.BIKE : VehicleType.AUTO,
      baseFare: offer.base_fare,
      distanceFare: offer.distance_fare,
      totalFare: offer.total_fare,
      currency: "INR",
      distanceKm: offer.distance_km ?? 0,
      // Not a real trip ETA (Ridora doesn't compute one) and not rendered
      // anywhere — kept only to satisfy FareEstimate's shape, same as
      // surgeMultiplier below. Pickup ETA (the number actually shown to
      // the driver) is the separate, real, top-level pickupEtaMinutes.
      etaMinutes: 0,
      surgeMultiplier: 1,
    },
  };
}

const VERIFICATION_LABEL: Record<DriverProfileRow["verification_status"], string> = {
  pending: "Pending review",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
};

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
  const [activeVehicle, setActiveVehicle] = React.useState<VehicleRow | null>(null);
  const [subscription, setSubscription] = React.useState<SubscriptionRow | null>(null);
  const [earningsToday, setEarningsToday] = React.useState({ total: 0, rides: 0 });
  const [walletBalance, setWalletBalance] = React.useState(0);
  const [togglingOnline, setTogglingOnline] = React.useState(false);
  // Ridora's correct matching model: a driver may hold several
  // simultaneous pending offers across different rides and chooses which
  // to accept — never capped to one (see
  // 20260908070000_matching_allow_concurrent_offers_per_driver.sql).
  // Pagination here is purely a UI/fetch-performance mechanism (one page
  // is plenty for virtually every driver) — there is no business limit on
  // how many offers can end up in `offers`; realtime INSERTs keep
  // appending to it regardless of pagination state.
  const [offers, setOffers] = React.useState<RideOfferRow[]>([]);
  const [offersHasMore, setOffersHasMore] = React.useState(false);
  const [loadingMoreOffers, setLoadingMoreOffers] = React.useState(false);
  // The cursor for the next page (last-loaded offer's offered_at) — kept
  // in a ref, not state, because it must NOT be derived from `offers`
  // itself: accepting/rejecting/expiring removes entries from `offers`,
  // and re-deriving the cursor from the (now shorter) array would corrupt
  // pagination — e.g. re-requesting rows already loaded, or skipping ones
  // that were never fetched. This ref only ever moves forward, once per
  // successful page fetch, independent of later removals.
  const nextOffersCursorRef = React.useRef<string | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [selfLocation, setSelfLocation] = React.useState<LatLng | null>(null);
  // Real road ETA (minutes) for the driver's current position -> each
  // offer's pickup point, keyed by offer id. Populated once per offer (see
  // the effect below) — never null-guessed, never re-fetched on a timer:
  // offers expire in OFFER_WINDOW_SECONDS (15s), far shorter than a
  // driver's own position could meaningfully change, so one fetch at
  // offer-arrival time is both sufficient and the cheapest correct choice
  // (avoids the "route API explosion" the product brief explicitly warns
  // against for multiple simultaneous offers).
  const [pickupEtaByOffer, setPickupEtaByOffer] = React.useState<Record<string, number | null>>({});
  const etaRequestedForRef = React.useRef<Set<string>>(new Set());

  // Single profile fetch, reused both to populate the dashboard AND to
  // compute the driver's lifecycle state below -- these used to be two
  // separate effects that each called getDriverProfile() independently,
  // firing two redundant, concurrent requests for the exact same row on
  // every Dashboard mount.
  const loadAll = React.useCallback(async () => {
    if (!user) return;
    setLoadError(false);
    try {
      const [driverProfile, vehicle, activeSub, earnings, wallet] = await Promise.all([
        getDriverProfile(supabase, user.id),
        getActiveVehicle(supabase, user.id),
        getActiveSubscription(supabase, user.id),
        getDriverEarningsSummary(supabase, user.id, "today"),
        getWallet(supabase, user.id),
      ]);
      setProfile(driverProfile);
      setActiveVehicle(vehicle);
      setSubscription(activeSub);
      setEarningsToday({ total: earnings.totalEarnings, rides: earnings.ridesCompleted });
      setWalletBalance(wallet?.balance ?? 0);
      // No redirect here (Part 1/2 fix): Driver Home always renders for
      // every driver state -- incomplete profile, pending/rejected
      // verification, approved-no-subscription, or fully ready -- with an
      // inline setup card explaining what's next (see the lifecycle banner
      // below) instead of unconditionally bouncing to /onboarding. A driver
      // whose vehicle was later deactivated/rejected, or who has one
      // incomplete profile field, used to be silently force-redirected away
      // from Home with no visibility into why on every single visit.
    } catch {
      setLoadError(true);
    }
  }, [supabase, user]);

  React.useEffect(() => {
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  // Reconcile against authoritative state on mount/reconnect — if a
  // realtime event was missed while this screen wasn't open, this catches
  // every already-pending offer rather than relying solely on the stream.
  React.useEffect(() => {
    if (!user) return;
    getActiveOffersForDriver(supabase, user.id).then((page) => {
      setOffers(page.offers);
      setOffersHasMore(page.hasMore);
      nextOffersCursorRef.current = page.nextCursor;
    });
  }, [supabase, user]);

  // Fetches the next page (by cursor, not offset — see nextOffersCursorRef's
  // comment) and merges it into the existing list, deduping by id in case a
  // realtime INSERT already delivered one of these rows in the meantime.
  async function handleLoadMoreOffers() {
    if (!user || !nextOffersCursorRef.current || loadingMoreOffers) return;
    setLoadingMoreOffers(true);
    try {
      const page = await getActiveOffersForDriver(supabase, user.id, { after: nextOffersCursorRef.current });
      setOffers((prev) => {
        const existingIds = new Set(prev.map((o) => o.id));
        return [...prev, ...page.offers.filter((o) => !existingIds.has(o.id))];
      });
      setOffersHasMore(page.hasMore);
      nextOffersCursorRef.current = page.nextCursor;
    } finally {
      setLoadingMoreOffers(false);
    }
  }

  // Real-time: subscribe to new offers made to this driver (INSERT) and to
  // status changes on the driver's own offers (UPDATE — rejected, lost a
  // race, expired, or superseded by that ride's passenger cancelling
  // during matching). Both filtered to this driver's own id — not a
  // broadcast-all subscription. Together these keep the multi-offer list
  // in sync without polling.
  React.useEffect(() => {
    if (!user) return;
    const unsubscribeNew = subscribeToDriverOffers(supabase, user.id, (offer) => {
      if (offer.status !== "pending") return;
      setOffers((prev) => (prev.some((o) => o.id === offer.id) ? prev : [...prev, offer]));
    });
    const unsubscribeUpdates = subscribeToDriverOfferUpdates(supabase, user.id, (offer) => {
      if (offer.status === "pending") return;
      setOffers((prev) => prev.filter((o) => o.id !== offer.id));
    });
    return () => {
      unsubscribeNew();
      unsubscribeUpdates();
    };
  }, [supabase, user]);

  // Fetches a real pickup ETA for each newly-seen offer, once — not on a
  // GPS-tick cadence (see pickupEtaByOffer's doc comment above for why a
  // single fetch per offer is the correct choice here, not a throttled
  // recurring one like ETA_CONFIG governs elsewhere). Requires the
  // driver's own live position (selfLocation, from the online-ping effect
  // below); if it isn't resolved yet, this simply retries on the next
  // effect run once it is — etaRequestedForRef is only marked AFTER a
  // fetch actually starts, so no offer is skipped forever for arriving
  // before the driver's first GPS fix. getRideOfferPickupLocation() and
  // fetchEta() both return null (never throw) on any failure — a failed
  // fetch leaves pickupEtaByOffer[id] unset, which the card already
  // renders as an honest distance-only state, never a fabricated number.
  React.useEffect(() => {
    if (!selfLocation) return;
    const pending = offers.filter((o) => !etaRequestedForRef.current.has(o.id));
    for (const offer of pending) {
      etaRequestedForRef.current.add(offer.id);
      (async () => {
        const pickup = await getRideOfferPickupLocation(supabase, offer.id);
        if (!pickup) return;
        const eta = await fetchEta(selfLocation, pickup, offer.vehicle_type);
        if (!eta) return;
        setPickupEtaByOffer((prev) => ({ ...prev, [offer.id]: Math.round(eta.durationSeconds / 60) }));
      })();
    }
  }, [offers, selfLocation, supabase]);

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
    // Ride eligibility (Part 2/3): going online requires BOTH verification
    // approval and an active subscription — two separate states, both
    // enforced again server-side by enforce_driver_online_requires_
    // subscription() (20260907 added the approval check there too).
    if (!profile.is_online && (profile.verification_status !== "approved" || !subscription)) return;
    setTogglingOnline(true);
    try {
      const next = !profile.is_online;
      await setDriverOnlineStatus(supabase, user.id, next);
      setProfile({ ...profile, is_online: next });
    } catch {
      // Server-side enforce_driver_online_requires_subscription rejects
      // this if the approval/subscription check fails at the DB level too
      // — surfacing nothing further here is acceptable since the button is
      // already disabled in that case.
    } finally {
      setTogglingOnline(false);
    }
  }

  async function handleAccept(item: RideOfferItem) {
    const claimed = await acceptRideRequest(supabase, item.rideId);
    if (claimed) {
      // Won — this driver is now busy (accept_ride_offer's own advisory-
      // lock guard prevents accepting any other ride from here on, see
      // 20260908070100_accept_ride_offer_single_active_ride_guard.sql).
      // Clear every other pending offer locally, and best-effort release
      // them server-side too so those rides' batch slots free up sooner
      // instead of waiting out their full expiry window — a throughput
      // optimization, not required for correctness.
      const others = offers.filter((o) => o.id !== item.id);
      setOffers([]);
      void Promise.allSettled(others.map((o) => rejectRideRequest(supabase, o.ride_id)));
      router.push(`/navigation?rideId=${claimed.id}`);
      return;
    }
    // Lost the race, the offer expired, or this driver was already busy —
    // accept_ride_offer() already marked this driver's own offer row
    // accordingly server-side. Only this one offer is removed; the rest
    // of the list is untouched.
    setOffers((prev) => prev.filter((o) => o.id !== item.id));
  }

  async function handleReject(item: RideOfferItem) {
    setOffers((prev) => prev.filter((o) => o.id !== item.id));
    try {
      await rejectRideRequest(supabase, item.rideId);
    } catch {
      // Best-effort — the offer will still naturally expire server-side
      // if this call fails, and the local list already reflects the
      // driver's decision.
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

  // Driver lifecycle state (Part 2) — computed, never redirected on. Every
  // driver sees Driver Home; this only decides which inline setup/status
  // card renders below the earnings/online-toggle content that's always
  // visible regardless of state.
  const setupIncomplete = !profile || !isDriverPersonalInfoComplete(profile) || !activeVehicle;
  const verificationPending = profile?.verification_status === "pending" || profile?.verification_status === "in_review";
  const verificationBlocked = profile?.verification_status === "rejected" || profile?.verification_status === "suspended";
  const verificationApproved = profile?.verification_status === "approved";

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

      {/* Header: quiet greeting + verification/subscription status, no card
          chrome. Verification is shown whenever it isn't a plain "approved"
          (Part 2/3 — verification and subscription are separate states,
          both surfaced here rather than only subscription as before). */}
      <div className="mt-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">
            {greeting()}, {firstName(profile?.full_name)}
          </p>
          {verificationApproved && subscription && (
            <p className="mt-0.5 text-xs text-ink-soft">
              {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)} plan · expires in{" "}
              {daysUntil(subscription.expires_at)} days
            </p>
          )}
        </div>
        {!setupIncomplete && (
          <StatusPill tone={verificationApproved ? (subscription ? "verified" : "alert") : "pending"} className="shrink-0">
            {verificationApproved ? (subscription ? "Active" : "Inactive") : VERIFICATION_LABEL[profile!.verification_status]}
          </StatusPill>
        )}
      </div>

      {/* Lifecycle setup/status card (Part 1/2/3) — exactly one of these
          renders, in priority order: incomplete profile, then verification
          pending/blocked, then (once approved) the existing subscription
          CTA/expiry-warning cards below. Never a redirect: the rest of
          Home (map, earnings, wallet, rating) still renders regardless. */}
      {setupIncomplete && (
        <Card className="mt-4" accent="marigold">
          <p className="text-sm font-semibold text-ink">Complete your driver profile</p>
          <p className="mt-1 text-xs text-ink-soft">
            Add your personal details and vehicle information to start driving with Ridora.
          </p>
          <Button size="sm" className="mt-3" onClick={() => router.push("/onboarding")}>
            Complete setup
          </Button>
        </Card>
      )}
      {!setupIncomplete && verificationPending && (
        <Card className="mt-4" accent="blue">
          <p className="text-sm font-semibold text-ink">Verification pending</p>
          <p className="mt-1 text-xs text-ink-soft">
            We're reviewing your documents. You can go online once an admin approves your account.
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => router.push("/documents")}>
            View documents
          </Button>
        </Card>
      )}
      {!setupIncomplete && verificationBlocked && (
        <Card className="mt-4" accent="red">
          <p className="text-sm font-semibold text-alert-red">
            {profile!.verification_status === "rejected" ? "Verification rejected" : "Account suspended"}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {profile!.verification_notes?.trim() || "Contact support for details."}
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => router.push("/support")}>
            Contact support
          </Button>
        </Card>
      )}

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

      {/* Online control — the second focal point. Ride eligibility (Part
          2/3) requires BOTH verification approval and an active
          subscription — the subtitle names whichever is actually blocking
          the driver, not just subscription as before. */}
      <OnlineToggle
        online={!!profile?.is_online}
        disabled={togglingOnline || (!profile?.is_online && (!verificationApproved || !subscription))}
        loading={togglingOnline}
        subtitle={
          !verificationApproved
            ? "Complete verification to start accepting rides"
            : !subscription
              ? "Subscribe to start accepting rides"
              : profile?.is_online
                ? "Looking for rides nearby…"
                : "Tap to start receiving ride requests"
        }
        onToggle={handleToggleOnline}
        className="mt-6"
      />

      {verificationApproved && !subscription && (
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
      {verificationApproved && subscription && daysUntil(subscription.expires_at) <= 3 && (
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

      <RideRequestSheet
        offers={offers.map((o) => toOfferItem(o, pickupEtaByOffer[o.id] ?? null))}
        onAccept={handleAccept}
        onReject={handleReject}
        onExpire={handleReject}
        hasMore={offersHasMore}
        onLoadMore={handleLoadMoreOffers}
        loadingMore={loadingMoreOffers}
      />
    </main>
  );
}
