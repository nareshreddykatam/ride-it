"use client";

import * as React from "react";
import { Button } from "@ride-it/ui";

export default function ContactPage() {
  const [submitted, setSubmitted] = React.useState(false);

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-display text-3xl font-medium text-ink">Contact us</h1>
      <p className="mt-2 text-ink-soft">
        Questions about Ride It? Send us a message and we&apos;ll get back to you.
      </p>

      {submitted ? (
        <div className="mt-8 rounded-lg border border-meter-green/30 bg-meter-green/5 p-4 text-sm text-ink">
          Thanks — we&apos;ve received your message and will be in touch soon.
        </div>
      ) : (
        <form
          className="mt-8 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            // TODO: wire to a support-ticket endpoint
            setSubmitted(true);
          }}
        >
          <input
            required
            placeholder="Your name"
            className="rounded-lg border border-border bg-white px-4 py-3 text-sm outline-none focus:border-signal-blue"
          />
          <input
            required
            type="email"
            placeholder="Email address"
            className="rounded-lg border border-border bg-white px-4 py-3 text-sm outline-none focus:border-signal-blue"
          />
          <textarea
            required
            rows={4}
            placeholder="How can we help?"
            className="resize-none rounded-lg border border-border bg-white px-4 py-3 text-sm outline-none focus:border-signal-blue"
          />
          <Button type="submit">Send message</Button>
        </form>
      )}
    </main>
  );
}
