import Link from "next/link";
import { Button } from "@ride-it/ui";
import { FareLineHero } from "../components/fare-line-hero";

const STEPS = [
  { title: "Set your destination", body: "Search where you're headed and see Bike and Auto fare estimates instantly." },
  { title: "Get matched", body: "A nearby driver accepts your ride — track them live on the map." },
  { title: "Verify with OTP", body: "Share your OTP with the driver to start the ride safely." },
  { title: "Pay and rate", body: "Pay by cash or UPI, then rate your ride." },
];

export default function MarketingHomePage() {
  return (
    <main>
      <section className="mx-auto max-w-5xl px-6 pb-16 pt-20">
        <p className="font-display text-sm font-medium text-signal-blue">Ride It</p>
        <h1 className="mt-3 max-w-2xl font-display text-5xl font-medium leading-tight text-ink">
          Your ride. Your way.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-ink-soft">
          Affordable Bike and Auto rides for passengers. For drivers: one flat
          subscription instead of a cut out of every fare — keep 100% of what
          you earn.
        </p>
        <div className="mt-8 flex gap-3">
          <Button size="lg">Download the app</Button>
          <Link href="/for-drivers">
            <Button size="lg" variant="outline">
              See driver plans
            </Button>
          </Link>
        </div>

        <div className="mt-14">
          <FareLineHero />
        </div>
      </section>

      <section className="border-t border-border bg-white py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="font-display text-2xl font-medium text-ink">How it works</h2>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.title}>
                <p className="font-meter text-sm text-marigold">{String(STEPS.indexOf(step) + 1).padStart(2, "0")}</p>
                <h3 className="mt-1 font-display text-base font-medium text-ink">{step.title}</h3>
                <p className="mt-1.5 text-sm text-ink-soft">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="font-display text-2xl font-medium text-ink">
          Drive with Ride It, keep every rupee you earn
        </h2>
        <p className="mt-2 max-w-xl text-sm text-ink-soft">
          Choose a Daily, Weekly, Monthly, or Yearly subscription. No
          per-ride commission, ever.
        </p>
        <div className="mt-6">
          <Link href="/for-drivers">
            <Button size="lg" variant="marigold">
              View subscription plans
            </Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
