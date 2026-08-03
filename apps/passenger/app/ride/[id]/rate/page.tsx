"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button, StarRating } from "@ride-it/ui";

export default function RatePage() {
  const router = useRouter();
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    // TODO: wire to ridesApi.rateRide(rideId, rating, comment)
    await new Promise((r) => setTimeout(r, 400));
    router.push("/home");
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-1 flex-col items-center pt-10 text-center"
      >
        <h1 className="font-display text-2xl font-medium text-ink">Rate your ride</h1>
        <p className="mt-1 text-sm text-ink-soft">How was your trip with Ramesh K.?</p>

        <div className="mt-6">
          <StarRating value={rating} onChange={setRating} size={40} />
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment (optional)"
          rows={3}
          className="mt-6 w-full resize-none rounded-lg border border-border bg-white p-3 text-sm text-ink outline-none placeholder:text-ink-soft focus:border-signal-blue"
        />
      </motion.div>

      <div className="pt-8">
        <Button className="w-full" disabled={rating === 0 || submitting} onClick={handleSubmit}>
          {submitting ? "Submitting…" : "Submit rating"}
        </Button>
        <button
          onClick={() => router.push("/home")}
          className="mt-3 w-full text-center text-sm text-ink-soft hover:underline"
        >
          Skip
        </button>
      </div>
    </main>
  );
}
