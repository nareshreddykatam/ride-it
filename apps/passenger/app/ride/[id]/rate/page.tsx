"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { Button, Skeleton, StarRating } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getRide, submitRating, getOwnRatingForRide, getRideParticipantName, type RideRow, type RatingRow } from "@ride-it/data";

// Ride statuses eligible for rating — matches submit_rating()'s own
// server-side check exactly (Phase 15), duplicated here only so the UI
// can decide what to show without an extra round trip; the RPC remains
// the actual authority regardless of what this renders.
const RATEABLE_STATUSES: RideRow["status"][] = ["ride_completed", "payment", "rated"];

export default function RatePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [ride, setRide] = React.useState<RideRow | null>(null);
  const [driverName, setDriverName] = React.useState<string | null>(null);
  const [existingRating, setExistingRating] = React.useState<RatingRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const r = await getRide(supabase, params.id);
      if (!active) return;
      setRide(r);
      if (r?.driver_id) {
        getRideParticipantName(supabase, params.id)
          .then((name) => active && setDriverName(name))
          .catch(() => {});
      }
      const own = await getOwnRatingForRide(supabase, params.id, user.id);
      if (!active) return;
      setExistingRating(own);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [supabase, params.id, user]);

  async function handleSubmit() {
    if (!user || rating === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await submitRating(supabase, params.id, rating, comment || undefined);
      setExistingRating(created);
    } catch (e) {
      // A duplicate-submission race (e.g. double-tap) surfaces here as a
      // real unique_violation from the database — shown honestly rather
      // than silently treated as success.
      setError(e instanceof Error ? e.message : "Couldn't submit your rating. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canRate = ride ? RATEABLE_STATUSES.includes(ride.status) && !!ride.driver_id : false;

  if (loading) {
    return (
      <main className="flex flex-1 flex-col px-6 py-8">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-6 h-10 w-full" />
      </main>
    );
  }

  if (existingRating) {
    return (
      <main className="flex flex-1 flex-col items-center px-6 py-10 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-meter-green/10 text-meter-green">
            <CheckCircle2 size={32} strokeWidth={1.8} />
          </span>
          <h1 className="mt-4 font-display text-xl font-semibold text-ink">Thanks for your feedback</h1>
          <div className="mt-4">
            <StarRating value={existingRating.rating} readOnly size={32} />
          </div>
          {existingRating.comment && (
            <p className="mt-3 max-w-xs text-sm text-ink-soft">&ldquo;{existingRating.comment}&rdquo;</p>
          )}
        </motion.div>
        <Button className="mt-8 w-full" onClick={() => router.push("/home")}>
          Done
        </Button>
      </main>
    );
  }

  if (!canRate) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-sm text-ink-soft">This ride isn&apos;t ready to be rated yet.</p>
        <Button className="mt-6 w-full" onClick={() => router.push("/home")}>
          Back to home
        </Button>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-1 flex-col items-center pt-10 text-center"
      >
        <h1 className="font-display text-2xl font-semibold text-ink">How was your ride?</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {driverName ? `Rate your trip with ${driverName}` : "Rate your driver"}
        </p>

        <div className="mt-8 rounded-2xl border border-border bg-surface px-6 py-8 shadow-sm">
          <StarRating value={rating} onChange={setRating} size={40} />
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Tell us about your experience (optional)"
          rows={3}
          maxLength={1000}
          className="mt-6 w-full resize-none rounded-lg border border-border bg-surface p-3 text-sm text-ink outline-none placeholder:text-ink-soft focus:border-signal-blue"
        />
        {error && <p className="mt-2 text-xs text-alert-red">{error}</p>}
      </motion.div>

      <div className="pt-8">
        <Button className="w-full" disabled={rating === 0 || submitting} onClick={handleSubmit}>
          {submitting ? "Submitting…" : "Submit rating"}
        </Button>
        <button onClick={() => router.push("/home")} className="mt-3 w-full text-center text-sm text-ink-soft hover:underline">
          Skip
        </button>
      </div>
    </main>
  );
}
