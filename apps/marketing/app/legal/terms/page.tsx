import { Card } from "@ride-it/ui";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <p className="font-meter text-xs font-medium uppercase tracking-wide text-signal-blue">
        Legal
      </p>
      <h1 className="mt-2 font-display text-4xl font-medium text-ink">Terms of Service</h1>
      <Card tone="outline" className="mt-8 p-6 text-sm text-ink-soft sm:p-8">
        This is placeholder legal copy. Final Terms of Service should be
        drafted and reviewed by legal counsel before launch, covering
        subscription billing terms, cancellation policy, liability, and
        dispute resolution specific to the Ridora platform.
      </Card>
    </main>
  );
}
