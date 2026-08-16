"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { Button, Skeleton, StarRating } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getRide,
  submitRating,
  getOwnRatingForRide,
  getRideParticipantName,
  type RideRow,
  type RatingRow,
} from "@ride-it/data";

// Matches submit_rating()'s own server-side eligible-status check
// (Phase 15) — duplicated here only so the UI can decide what to show;
// the RPC remains the actual authority regardless.
const RATEABLE_STATUSES: RideRow["status"][] = ["ride_completed", "payment", "rated"];

export default function DriverRatePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [ride, setRide] = React.useState<RideRow | null>(null);
  const [passengerName, setPassengerName] = React.useState<string | null>(null);
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
      getRideParticipantName(supabase, params.id)
        .then((name) => active && setPassengerName(name))
        .catch(() => {});
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
      setError(e instanceof Error ? e.message : "Couldn't submit your rating. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canRate = ride ? RATEABLE_STATUSES.includes(ride.status) : false;

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
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <CheckCircle2 size={40} className="mx-auto text-meter-green" />
          <h1 className="mt-3 font-display text-xl font-medium text-ink">Thanks for your feedback</h1>
          <div className="mt-4">
            <StarRating value={existingRating.rating} readOnly size={32} />
          </div>
          {existingRating.comment && <p className="mt-3 max-w-xs text-sm text-ink-soft">&ldquo;{existingRating.comment}&rdquo;</p>}
        </motion.div>
        <Button className="mt-8 w-full" onClick={() => router.push("/dashboard")}>
          Done
        </Button>
      </main>
    );
  }

  if (!canRate) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-sm text-ink-soft">This ride isn&apos;t ready to be rated yet.</p>
        <Button className="mt-6 w-full" onClick={() => router.push("/dashboard")}>
          Back to dashboard
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
        <h1 className="font-display text-2xl font-medium text-ink">How was your passenger?</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {passengerName ? `Rate your trip with ${passengerName}` : "Rate your passenger"}
        </p>

        <div className="mt-6">
          <StarRating value={rating} onChange={setRating} size={40} />
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a note (optional)"
          rows={3}
          maxLength={1000}
          className="mt-6 w-full resize-none rounded-lg border border-border bg-white p-3 text-sm text-ink outline-none placeholder:text-ink-soft focus:border-signal-blue"
        />
        {error && <p className="mt-2 text-xs text-alert-red">{error}</p>}
      </motion.div>

      <div className="pt-8">
        <Button className="w-full" disabled={rating === 0 || submitting} onClick={handleSubmit}>
          {submitting ? "Submitting…" : "Submit rating"}
        </Button>
        <button onClick={() => router.push("/dashboard")} className="mt-3 w-full text-center text-sm text-ink-soft hover:underline">
          Skip
        </button>
      </div>
    </main>
  );
}
