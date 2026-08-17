import { Card } from "@ride-it/ui";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <p className="font-meter text-xs font-medium uppercase tracking-wide text-signal-blue">
        Legal
      </p>
      <h1 className="mt-2 font-display text-4xl font-medium text-ink">Privacy Policy</h1>
      <Card tone="outline" className="mt-8 p-6 text-sm text-ink-soft sm:p-8">
        This is placeholder legal copy. Final Privacy Policy should be
        drafted and reviewed by legal counsel before launch, covering
        location data collection, document/KYC data handling, and
        third-party sharing (payment processors, SMS/OTP providers, maps).
      </Card>
    </main>
  );
}
