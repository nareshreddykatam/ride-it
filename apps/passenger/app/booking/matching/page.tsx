"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { advanceMatching, cancelMatchingRide, subscribeToRide } from "@ride-it/data";
import { MockMap } from "@ride-it/maps";

// How often the passenger's client "heartbeats" the matching engine
// forward (expire stale offers, dispatch the next batch if needed) — see
// @ride-it/data/matching.ts and the matching_engine migration for why
// this is pull-based rather than a server-side scheduler.
const HEARTBEAT_INTERVAL_MS = 3000;

function MatchingPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const rideId = params.get("rideId");
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const [noDriversFound, setNoDriversFound] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const settledRef = React.useRef(false);

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
    if (!rideId) return;
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
        <p className="font-display text-lg font-medium text-ink">No drivers available right now</p>
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
    <main className="flex flex-1 flex-col px-6 py-8">
      <MockMap variant="searching" className="h-64" />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-8 flex flex-1 flex-col items-center justify-center text-center"
      >
        <p className="font-display text-lg font-medium text-ink">Searching for nearby drivers…</p>
        <p className="mt-1 text-sm text-ink-soft">Finding your driver — this can take up to a minute or so.</p>
      </motion.div>
      <Button variant="outline" className="w-full" disabled={cancelling} onClick={handleCancel}>
        {cancelling ? "Cancelling…" : "Cancel"}
      </Button>
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
