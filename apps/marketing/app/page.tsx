import Link from "next/link";
import {
  AutoIcon,
  BikeIcon,
  Button,
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
      {/* Hero — large-type brand moment, no decorative graphics. A real
          production ride-hailing site leans on typography and a solid
          brand-blue field, not a floating icon or a gradient/blur wash.
          The fare-comparison proof card is pulled up over the section
          boundary so the page doesn't read as flatly stacked blocks. */}
      <section className="bg-ink-blue">
        <div className="mx-auto max-w-6xl px-6 pb-28 pt-16 sm:pb-36 sm:pt-24 lg:pt-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/90">
            <span className="h-1.5 w-1.5 rounded-full bg-marigold" aria-hidden="true" />
            Bike &amp; Auto rides
          </span>

          <h1 className="mt-7 max-w-4xl font-display text-6xl font-medium leading-[0.96] text-white sm:text-7xl lg:text-[6rem] lg:leading-[0.94]">
            Your ride.
            <br />
            Your city.
            <br />
            <span className="text-marigold">Your way.</span>
          </h1>

          <div className="mt-10 max-w-md">
            <p className="text-lg text-white/80 sm:text-xl">
              Affordable Bike and Auto rides for passengers. For drivers: one
              flat subscription instead of a cut out of every fare — keep
              100% of what you earn.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Button size="lg" variant="marigold" disabled>
                Download the app
              </Button>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90">
                Coming soon
              </span>
            </div>
            <Link href="/for-drivers" className="mt-4 inline-block">
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
      </section>

      {/* Proof card deliberately breaks the section boundary instead of
          sitting stacked below it. */}
      <div className="relative z-10 mx-auto -mt-14 max-w-2xl px-6 sm:-mt-16">
        <FareLineHero />
      </div>

      {/* How it works — asymmetric split (intro column + connected step
          list), not a fourth repeated card grid. */}
      <section className="bg-paper pb-20 pt-20 sm:pb-28 sm:pt-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-20">
            <div>
              <p className="font-meter text-xs font-medium uppercase tracking-wide text-signal-blue">
                How it works
              </p>
              <h2 className="mt-3 max-w-xs font-display text-4xl font-medium leading-[1.05] text-ink sm:text-5xl">
                From search to ride in four steps
              </h2>
            </div>

            <ol className="flex flex-col">
              {STEPS.map((step, i) => (
                <li key={step.title} className="relative flex gap-5 pb-9 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${step.tint}`}>
                      <step.icon size={20} aria-hidden="true" />
                    </span>
                    {i < STEPS.length - 1 && (
                      <span className="mt-2 w-px flex-1 bg-border" aria-hidden="true" />
                    )}
                  </div>
                  <div className="pt-1.5">
                    <p className="font-meter text-xs text-ink-soft">
                      Step {String(i + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-medium text-ink">{step.title}</h3>
                    <p className="mt-1.5 max-w-md text-sm text-ink-soft">{step.body}</p>
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
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Driver CTA — solid marigold banner, the pricing/earnings hue.
          Flat fill, not a gradient or decorative icon: text is dark ink,
          not white, since marigold is a light-mid-tone background and
          white text fails contrast here (unlike the dark hero band). */}
      <section className="bg-marigold">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-6 py-20 sm:flex-row sm:items-center sm:justify-between sm:py-28">
          <div className="max-w-xl">
            <p className="font-meter text-xs font-medium uppercase tracking-wide text-ink/70">
              For drivers
            </p>
            <h2 className="mt-3 font-display text-4xl font-medium leading-[1.05] text-ink sm:text-5xl">
              Drive with Ride It, keep every rupee you earn
            </h2>
            <p className="mt-4 max-w-md text-base text-ink/80 sm:text-lg">
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
