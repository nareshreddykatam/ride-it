"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Button, Card, Input } from "@ride-it/ui";

export default function ContactPage() {
  const [submitted, setSubmitted] = React.useState(false);

  return (
    <main className="mx-auto max-w-xl px-6 py-16 sm:py-20">
      <p className="font-meter text-xs font-medium uppercase tracking-wide text-signal-blue">
        Get in touch
      </p>
      <h1 className="mt-2 font-display text-4xl font-medium text-ink">Contact us</h1>
      <p className="mt-2 text-ink-soft">
        Questions about Ridora? Send us a message and we&apos;ll get back to you.
      </p>

      {submitted ? (
        <Card tone="tinted" accent="green" className="mt-8 flex items-center gap-3">
          <CheckCircle2 size={20} className="shrink-0 text-meter-green" aria-hidden="true" />
          <p className="text-sm text-ink">
            Thanks — we&apos;ve received your message and will be in touch soon.
          </p>
        </Card>
      ) : (
        <Card tone="elevated" className="mt-8 p-6 sm:p-8">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              // TODO: wire to a support-ticket endpoint
              setSubmitted(true);
            }}
          >
            <Input required placeholder="Your name" aria-label="Your name" />
            <Input required type="email" placeholder="Email address" aria-label="Email address" />
            <textarea
              required
              rows={4}
              placeholder="How can we help?"
              aria-label="How can we help?"
              className="resize-none rounded-lg border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition-all placeholder:text-ink-soft/70 focus:border-signal-blue focus:shadow-[0_0_0_3px_rgba(30,111,239,0.12)]"
            />
            <Button type="submit">Send message</Button>
          </form>
        </Card>
      )}
    </main>
  );
}
