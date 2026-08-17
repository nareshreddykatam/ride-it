import Link from "next/link";
import {
  AutoIcon,
  BikeIcon,
  Button,
  Card,
  DriverIcon,
  LocationIcon,
  PaymentIcon,
  SafetyIcon,
} from "@ride-it/ui";
import { FareLineHero } from "../components/fare-line-hero";

const STEPS = [
  {
    title: "Set your destination",
    body: "Search where you're headed and see Bike and Auto fare estimates instantly.",
    icon: LocationIcon,
    tint: "bg-tint-blue text-signal-blue",
    showVehicles: true,
  },
  {
    title: "Get matched",
    body: "A nearby driver accepts your ride — track them live on the map.",
    icon: DriverIcon,
    tint: "bg-tint-violet text-violet-text",
    showVehicles: false,
  },
  {
    title: "Verify with OTP",
    body: "Share your OTP with the driver to start the ride safely.",
    icon: SafetyIcon,
    tint: "bg-meter-green/10 text-meter-green-text",
    showVehicles: false,
  },
  {
    title: "Pay and rate",
    body: "Pay by cash or UPI, then rate your ride.",
    icon: PaymentIcon,
    tint: "bg-tint-marigold text-marigold-text",
    showVehicles: false,
  },
];

export default function MarketingHomePage() {
  return (
    <main>
      {/* Hero — full-bleed dark gradient, the site's signature surface */}
      <section className="relative overflow-hidden bg-gradient-hero">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-violet/20 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-32 left-1/3 h-80 w-80 rounded-full bg-signal-blue/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-5xl px-6 pb-20 pt-14 sm:pb-28 sm:pt-20">
          <div className="flex items-start justify-between gap-10">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/90">
                <span className="h-1.5 w-1.5 rounded-full bg-marigold" aria-hidden="true" />
                Bike &amp; Auto rides
              </span>
              <h1 className="mt-5 font-display text-4xl font-medium leading-[1.08] text-white sm:text-6xl">
                Your ride.
                <br />
                Your city.
                <br />
                <span className="text-marigold">Your way.</span>
              </h1>
              <p className="mt-5 max-w-lg text-base text-white/80 sm:text-lg">
                Affordable Bike and Auto rides for passengers. For drivers: one
                flat subscription instead of a cut out of every fare — keep
                100% of what you earn.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" variant="marigold" disabled>
                  Download the app
                </Button>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90">
                  Coming soon
                </span>
                <Link href="/for-drivers">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white/30 text-white hover:border-white/60 hover:bg-white/10"
                  >
                    See driver plans
                  </Button>
                </Link>
              </div>
            </div>

            <div className="relative hidden shrink-0 lg:block" aria-hidden="true">
              <div className="relative h-56 w-56">
                <span className="absolute right-2 top-0 flex h-28 w-28 animate-float-y items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white backdrop-blur-sm">
                  <AutoIcon size={60} strokeWidth={1.3} />
                </span>
                <span className="absolute bottom-2 left-0 flex h-20 w-20 animate-float-y items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white backdrop-blur-sm [animation-delay:0.6s]">
                  <BikeIcon size={40} strokeWidth={1.3} />
                </span>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-14 max-w-2xl">
            <FareLineHero />
          </div>
        </div>
      </section>

      {/* How it works — icon cards, not a bare numbered list */}
      <section className="border-t border-border bg-paper py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="max-w-xl">
            <p className="font-meter text-xs font-medium uppercase tracking-wide text-signal-blue">
              How it works
            </p>
            <h2 className="mt-2 font-display text-3xl font-medium text-ink">
              From search to ride in four steps
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <Card key={step.title} tone="elevated" className="flex flex-col">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${step.tint}`}>
                  <step.icon size={20} aria-hidden="true" />
                </span>
                <p className="mt-4 font-meter text-xs text-ink-soft">
                  Step {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-1 font-display text-base font-medium text-ink">{step.title}</h3>
                <p className="mt-1.5 text-sm text-ink-soft">{step.body}</p>
                {step.showVehicles && (
                  <span className="mt-3 inline-flex items-center gap-3 text-ink-soft">
                    <span className="inline-flex items-center gap-1 text-xs">
                      <AutoIcon size={15} className="text-marigold-text" aria-hidden="true" />
                      Auto
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs">
                      <BikeIcon size={15} className="text-violet-text" aria-hidden="true" />
                      Bike
                    </span>
                  </span>
                )}
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Driver CTA — strong marigold banner, the pricing/earnings hue.
          Text is dark ink, not white: marigold/orange is a light-mid-tone
          background, so white text fails contrast here (unlike the dark
          gradient-hero sections) — see DESIGN_SYSTEM contrast note. */}
      <section className="relative overflow-hidden bg-gradient-cta">
        <AutoIcon
          size={220}
          strokeWidth={1}
          className="pointer-events-none absolute -bottom-10 -right-10 text-ink/10"
          aria-hidden="true"
        />
        <div className="relative mx-auto flex max-w-5xl flex-col items-start gap-6 px-6 py-16 sm:flex-row sm:items-center sm:justify-between sm:py-20">
          <div className="max-w-xl">
            <p className="font-meter text-xs font-medium uppercase tracking-wide text-ink/70">
              For drivers
            </p>
            <h2 className="mt-2 font-display text-3xl font-medium text-ink sm:text-4xl">
              Drive with Ride It, keep every rupee you earn
            </h2>
            <p className="mt-3 max-w-md text-ink/80">
              Choose a Daily, Weekly, Monthly, or Yearly subscription. No
              per-ride commission, ever.
            </p>
          </div>
          <Link href="/for-drivers" className="shrink-0">
            <Button size="lg" className="bg-ink text-white shadow-lg hover:bg-ink/90">
              View subscription plans
            </Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
