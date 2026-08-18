"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, MatchingRadar, type VehicleKind } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { advanceMatching, cancelMatchingRide, subscribeToRide } from "@ride-it/data";
import { MockMap } from "@ride-it/maps";

// How often the passenger's client "heartbeats" the matching engine
// forward (expire stale offers, dispatch the next batch if needed) — see
// @ride-it/data/matching.ts and the matching_engine migration for why
// this is pull-based rather than a server-side scheduler.
const HEARTBEAT_INTERVAL_MS = 3000;

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function MatchingPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const rideId = params.get("rideId");
  const vehicleParam = params.get("vehicleType");
  const vehicle: VehicleKind =
    vehicleParam === "bike" || vehicleParam === "scooty" || vehicleParam === "car" ? vehicleParam : "auto";
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const [noDriversFound, setNoDriversFound] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const settledRef = React.useRef(false);

  // Real, honestly-derived elapsed time since this screen mounted — not a
  // fabricated "drivers nearby" style figure. Purely a client-side ticker;
  // doesn't touch matching state or drive any logic.
  React.useEffect(() => {
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (!rideId) return;

    function handleSettled(status: string) {
      if (settledRef.current) return;
      if (status === "accepted") {
        settledRef.current = true;
        router.push(`/ride/${rideId}`);
      } else if (status === "cancelled") {
        settledRef.current = true;
        setNoDriversFound(true);
      }
    }

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
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-alert-red/10 text-alert-red">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      <MatchingRadar
        vehicle={vehicle}
        mapSlot={<MockMap variant="searching" className="h-full w-full rounded-none border-0" />}
        elapsedLabel={formatElapsed(elapsedSeconds)}
        onCancel={handleCancel}
      />
    </main>
  );
}

export default function MatchingPage() {
  return (
    <Suspense fallback={null}>
      <MatchingPageContent />
    </Suspense>
  );
}
