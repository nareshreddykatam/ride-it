import { CheckCircle2 } from "lucide-react";
import { Button, Card, MeterValue, StatusPill, WalletIcon } from "@ride-it/ui";

const PLANS = [
  { plan: "Daily", amount: 49, blurb: "Try it out, pay day by day" },
  { plan: "Weekly", amount: 299, blurb: "Save 12% vs daily", tag: "Save 12%" },
  { plan: "Monthly", amount: 999, blurb: "Best for full-time drivers", tag: "Most popular" },
  { plan: "Yearly", amount: 9999, blurb: "Save 17% vs monthly", tag: "Save 17%" },
];

export default function ForDriversPage() {
  return (
    <main>
      {/* Solid marigold — the pricing/earnings hue, flat fill. Dark ink
          text keeps comfortable contrast here, unlike the dark hero band
          sections which use white text. */}
      <section className="bg-marigold">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-ink/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink/80">
            <WalletIcon size={13} aria-hidden="true" />
            Flat subscription
          </span>
          <h1 className="mt-4 font-display text-4xl font-medium text-ink sm:text-5xl">
            One flat fee. Keep every rupee you earn.
          </h1>
          <p className="mt-3 max-w-xl text-ink/80">
            Most platforms take a cut of every single ride. Ridora charges
            one fixed subscription instead — the rest of the fare, cash or
            UPI, is entirely yours.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => {
            const popular = p.tag === "Most popular";
            return (
              <Card
                key={p.plan}
                tone={popular ? "tinted" : "elevated"}
                accent={popular ? "marigold" : undefined}
                className={popular ? "ring-1 ring-marigold/40" : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-base font-medium text-ink">{p.plan}</p>
                  {p.tag && (
                    <StatusPill tone="pending" dot={false}>
                      {p.tag}
                    </StatusPill>
                  )}
                </div>
                <MeterValue value={`₹${p.amount}`} size="lg" className="mt-3" />
                <p className="mt-2 text-xs text-ink-soft">{p.blurb}</p>
                <Button size="sm" className="mt-4 w-full" variant={popular ? "marigold" : "outline"}>
                  Get started
                </Button>
              </Card>
            );
          })}
        </div>

        <section className="mt-16">
          <Card tone="elevated" className="p-8">
            <h2 className="font-display text-xl font-medium text-ink">What you&apos;ll need</h2>
            <ul className="mt-4 grid grid-cols-1 gap-2 text-sm text-ink-soft sm:grid-cols-2">
              {[
                "Aadhaar Card",
                "Valid Driving License",
                "Vehicle Registration Certificate (RC)",
                "Vehicle Insurance",
                "A selfie for identity verification",
                "A Bike or Auto",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="shrink-0 text-meter-green" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </div>
    </main>
  );
}
