import { Button, Card, MeterValue, StatusPill } from "@ride-it/ui";

const PLANS = [
  { plan: "Daily", amount: 49, blurb: "Try it out, pay day by day" },
  { plan: "Weekly", amount: 299, blurb: "Save 12% vs daily", tag: "Save 12%" },
  { plan: "Monthly", amount: 999, blurb: "Best for full-time drivers", tag: "Most popular" },
  { plan: "Yearly", amount: 9999, blurb: "Save 17% vs monthly", tag: "Save 17%" },
];

export default function ForDriversPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="font-display text-3xl font-medium text-ink">
        One flat fee. Keep every rupee you earn.
      </h1>
      <p className="mt-2 max-w-xl text-ink-soft">
        Most platforms take a cut of every single ride. Ride It charges one
        fixed subscription instead — the rest of the fare, cash or UPI, is
        entirely yours.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => (
          <Card key={p.plan}>
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-medium text-ink">{p.plan}</p>
              {p.tag && <StatusPill tone="pending">{p.tag}</StatusPill>}
            </div>
            <MeterValue value={`₹${p.amount}`} size="lg" className="mt-3" />
            <p className="mt-2 text-xs text-ink-soft">{p.blurb}</p>
            <Button size="sm" className="mt-4 w-full" variant="outline">
              Get started
            </Button>
          </Card>
        ))}
      </div>

      <section className="mt-16 rounded-xl border border-border bg-white p-8">
        <h2 className="font-display text-xl font-medium text-ink">What you&apos;ll need</h2>
        <ul className="mt-4 grid grid-cols-1 gap-2 text-sm text-ink-soft sm:grid-cols-2">
          <li>Aadhaar Card</li>
          <li>Valid Driving License</li>
          <li>Vehicle Registration Certificate (RC)</li>
          <li>Vehicle Insurance</li>
          <li>A selfie for identity verification</li>
          <li>A Bike or Auto</li>
        </ul>
      </section>
    </main>
  );
}
