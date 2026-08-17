import { Card } from "@ride-it/ui";

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <p className="font-meter text-xs font-medium uppercase tracking-wide text-signal-blue">
        Our story
      </p>
      <h1 className="mt-2 font-display text-4xl font-medium text-ink">About Ride It</h1>

      <Card tone="elevated" className="mt-8 flex flex-col gap-4 p-6 text-ink-soft sm:p-8">
        <p>
          Ride It exists because the standard ride-hailing model asks drivers
          to give up a slice of every single fare to the platform that
          connects them with riders. We think that&apos;s backwards. Drivers do
          the driving, own the vehicle, and take on the risk — they should
          keep what they earn.
        </p>
        <p>
          So we built a different kind of platform: drivers pay one flat
          subscription — daily, weekly, monthly, or yearly — and everything
          they make from every ride after that is theirs. No commission, no
          surprise deductions, no meter running against them.
        </p>
        <p>
          For passengers, that means the same simple experience you&apos;d
          expect — search, book, ride, pay — with clear, predictable fares
          for Bike and Auto rides.
        </p>
      </Card>
    </main>
  );
}
