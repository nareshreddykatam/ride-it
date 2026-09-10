"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, MatchingRadar, PageLoader, type VehicleKind } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { advanceMatching, cancelMatchingRide, subscribeToRide, getRide, getAppSettingValue } from "@ride-it/data";
import { RideMap } from "@ride-it/maps";

// How often the passenger's client "heartbeats" the matching engine
// forward (expire stale offers, dispatch the next batch if needed) — see
// @ride-it/data/matching.ts and the matching_engine migration for why
// this is pull-based rather than a server-side scheduler.
const HEARTBEAT_INTERVAL_MS = 3000;

// Display-only fallback if the app_settings row is somehow unreadable —
// matches the server's own default in dispatch_next_batch(). The REAL
// minimum is enforced entirely server-side (rides.requested_at +
// matching_minimum_search_seconds, checked inside dispatch_next_batch());
// this value only decides what number the countdown starts from, and is
// immediately corrected once the real setting loads.
const DEFAULT_MIN_SEARCH_SECONDS = 180;

function formatDuration(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function MatchingPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const rideId = params.get("rideId");
  const vehicleParam = params.get("vehicleType");
  // Set only when this screen was reached via the driver-cancelled ->
  // automatic-reassignment path (see apps/passenger/app/ride/[id]/page.tsx),
  // not the normal first-time booking flow — surfaces the "your driver
  // cancelled" context the passenger needs before the familiar "searching"
  // UI takes over, without duplicating any of MatchingRadar's own UI.
  const reassigning = params.get("reason") === "driver_cancelled";
  const vehicle: VehicleKind =
    vehicleParam === "bike" || vehicleParam === "scooty" || vehicleParam === "car" ? vehicleParam : "auto";
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const [noDriversFound, setNoDriversFound] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  // The ride's own requested_at, fetched once from the server — the sole
  // source of truth the countdown is derived from. Never a client-only
  // "seconds since this screen mounted" counter: that would restart at
  // 3:00 on every reload/navigate-away-and-back, exactly the fake-countdown
  // behavior this screen must not have. requested_at is set once at ride
  // creation and never changes, so re-fetching it (on mount, on reload, on
  // returning to this screen) always reproduces the same real start time.
  const [requestedAt, setRequestedAt] = React.useState<string | null>(null);
  const [minSearchSeconds, setMinSearchSeconds] = React.useState(DEFAULT_MIN_SEARCH_SECONDS);
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const settledRef = React.useRef(false);
  // Set by the settle effect below so the initial fetch (which runs in its
  // own effect) can hand off a ride that had already progressed before this
  // screen mounted, without waiting for the first heartbeat tick.
  const settleRef = React.useRef<((status: string) => void) | null>(null);

  React.useEffect(() => {
    if (!rideId) return;
    getRide(supabase, rideId).then((ride) => {
      if (ride) {
        setRequestedAt(ride.requested_at);
        settleRef.current?.(ride.status);
      }
    });
    // Display-only — the actual minimum is enforced server-side inside
    // dispatch_next_batch() regardless of what this read returns.
    getAppSettingValue(supabase, "matching_minimum_search_seconds").then((value) => {
      const parsed = typeof value === "number" ? value : typeof value === "string" ? parseInt(value, 10) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) setMinSearchSeconds(parsed);
    });
  }, [rideId, supabase]);

  // Ticks the clock so the countdown display re-renders every second — the
  // actual remaining-time VALUE below is always recomputed from
  // requestedAt + Date.now(), never accumulated/incremented locally, so it
  // can't drift and correctly reflects real elapsed time even if the tab
  // was backgrounded (setInterval throttling doesn't matter here — a
  // missed tick just means the next one jumps straight to the correct
  // value instead of the display looking stale for a moment).
  React.useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remainingSeconds = requestedAt
    ? Math.max(0, minSearchSeconds - Math.floor((nowMs - new Date(requestedAt).getTime()) / 1000))
    : null;

  React.useEffect(() => {
    if (!rideId) return;

    /**
     * Matching is over the moment the ride is no longer requested/matched.
     *
     * Phase 1 audit (AUDIT-010): this previously handled only "accepted"
     * and "cancelled". Every other status fell through, so a passenger who
     * pressed Back onto this screen after the ride had progressed past
     * acceptance — driver_arriving, ride_started, or already finished —
     * sat on the "Searching for a driver" radar forever while the 3-second
     * heartbeat kept calling advance_ride_matching() indefinitely.
     */
    function handleSettled(status: string) {
      if (settledRef.current) return;
      if (status === "requested" || status === "matched") return;
      settledRef.current = true;
      if (status === "cancelled") {
        setNoDriversFound(true);
      } else if (status === "ride_completed" || status === "payment") {
        router.replace(`/ride/${rideId}/complete`);
      } else if (status === "rated") {
        router.replace(`/history/${rideId}`);
      } else {
        router.replace(`/ride/${rideId}`);
      }
    }

    settleRef.current = handleSettled;

    // Realtime: react immediately the moment the ride's status actually
    // changes (a driver accepted, or matching gave up) — not waiting for
    // the next heartbeat tick.
    const unsubscribe = subscribeToRide(supabase, rideId, (ride) => handleSettled(ride.status));

    // Heartbeat: drives matching forward (expiring stale offers, dispatching
    // the next batch) — this is what actually makes progress happen, the
    // realtime subscription above only reacts once it does.
    const interval = setInterval(async () => {
      if (settledRef.current) return;
      try {
        const status = await advanceMatching(supabase, rideId);
        handleSettled(status);
      } catch {
        // Transient errors are swallowed here — the next tick retries.
        // The passenger can always cancel manually if this persists.
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      settleRef.current = null;
      unsubscribe();
      clearInterval(interval);
    };
  }, [rideId, router, supabase]);

  async function handleCancel() {
    if (!rideId || cancelling) return;
    setCancelling(true);
    try {
      await cancelMatchingRide(supabase, rideId, "Passenger cancelled while searching");
      router.push("/home");
    } catch {
      setCancelling(false);
    }
  }

  if (noDriversFound) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-alert-red/10 text-alert-red">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M9 9l6 6M15 9l-6 6" />
          </svg>
        </span>
        <p className="mt-4 font-display text-lg font-semibold text-ink">No drivers available right now</p>
        <p className="mt-1 max-w-xs text-sm text-ink-soft">
          We couldn&apos;t find a nearby driver for this ride. You haven&apos;t been charged.
        </p>
        <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
          <Button className="w-full" onClick={() => router.push("/search")}>
            Try again
          </Button>
          <Button variant="outline" className="w-full" onClick={() => router.push("/home")}>
            Back to home
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      {reassigning && (
        <div className="absolute inset-x-0 top-0 z-20 mx-4 mt-4 rounded-lg bg-alert-red/95 px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg backdrop-blur-sm">
          Your driver cancelled the ride. Finding you another driver…
        </div>
      )}
      <MatchingRadar
        vehicle={vehicle}
        mapSlot={<RideMap fallbackVariant="searching" className="h-full w-full rounded-none border-0" />}
        elapsedLabel={remainingSeconds !== null ? formatDuration(remainingSeconds) : undefined}
        onCancel={handleCancel}
      />
    </main>
  );
}

export default function MatchingPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <MatchingPageContent />
    </Suspense>
  );
}
