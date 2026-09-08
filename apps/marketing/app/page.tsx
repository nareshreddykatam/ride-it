import { CheckCircle2, HeadphonesIcon, MapPinned, ShieldCheck } from "lucide-react";
import { HeroStreetScene } from "../components/illustrations/street-scene";
import { PhoneMapVisual } from "../components/illustrations/phone-map-visual";
import { DriverVisual } from "../components/illustrations/driver-visual";
import { SafetyShieldArt } from "../components/illustrations/safety-shield";
import { UrbanCloseScene } from "../components/illustrations/city-scene";
import { VEHICLE_ART, type VehicleKind } from "../components/illustrations/vehicles";
import { CtaButton } from "../components/ui/cta-button";
import { Reveal } from "../components/reveal";
import { getPublicRideStats } from "../lib/ride-stats";

// Static generation + background revalidation every 5 minutes — the stat
// "feels live" without a client-side fetch or a DB round-trip on every
// single homepage visit.
export const revalidate = 300;

const FEATURED_RIDE: { kind: VehicleKind; label: string; blurb: string } = {
  kind: "auto",
  label: "Auto",
  blurb: "The everyday ride — quick to flag down, easy on the fare, built for short city hops.",
};

const OTHER_RIDES: Array<{ kind: VehicleKind; label: string; blurb: string }> = [
  { kind: "bike", label: "Bike", blurb: "Quick city rides, especially where traffic is slow." },
  { kind: "scooty", label: "Scooty", blurb: "Easy and affordable for a short solo trip." },
  { kind: "car", label: "Car", blurb: "More space and comfort when you need it." },
];

const JOURNEY_STEPS = [
  { n: "01", title: "Set your pickup", body: "Tell us where you are and where you're going." },
  { n: "02", title: "Get matched", body: "We connect you with the nearest verified driver." },
  { n: "03", title: "Start your ride", body: "Track your trip live and reach safely." },
];

const SAFETY_FEATURES = [
  { icon: ShieldCheck, title: "Verified drivers", body: "Aadhaar, license, RC and insurance reviewed before anyone goes online." },
  { icon: MapPinned, title: "Live ride tracking", body: "See your driver's location in real time from pickup to drop." },
  { icon: HeadphonesIcon, title: "In-app support", body: "Reach Ridora support directly from the app when you need help." },
  { icon: CheckCircle2, title: "Secure payment options", body: "Pay by cash, driver UPI, or online — your choice, every ride." },
];

export default async function MarketingHomePage() {
  const stats = await getPublicRideStats();
  const rideOptionCount = Object.keys(VEHICLE_ART).length;

  return (
    <main>
      {/* ============================== HERO ============================== */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 lg:grid-cols-5">
          <div className="flex flex-col justify-center px-6 py-16 sm:py-20 lg:col-span-2 lg:py-28 lg:pr-10">
            <Reveal>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-rd-teal-dark">
                Your city. Your ride.
              </span>
            </Reveal>
            <Reveal delayMs={80}>
              <h1 className="mt-5 font-display text-5xl font-medium leading-[0.98] text-rd-navy sm:text-6xl">
                Your city.
                <br />
                Your ride.
              </h1>
            </Reveal>
            <Reveal delayMs={140}>
              <p className="mt-6 max-w-sm text-lg text-rd-gray">
                Simple, reliable rides for getting where you need to go — Bike, Scooty, Auto or
                Car.
              </p>
            </Reveal>
            <Reveal delayMs={200}>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <CtaButton href="https://app.ridora.in">Book a Ride</CtaButton>
                <CtaButton href="https://driver.ridora.in" variant="outline">
                  Drive with Ridora
                </CtaButton>
              </div>
            </Reveal>
          </div>

          <Reveal delayMs={120} as="div" className="lg:col-span-3">
            <HeroStreetScene className="aspect-[4/5] w-full sm:aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[560px]" />
          </Reveal>
        </div>
      </section>

      {/* ============================== STATS ============================== */}
      <section className="border-y border-rd-line bg-rd-bg">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <Reveal className="flex items-baseline gap-3">
            <span className="font-display text-3xl font-semibold text-rd-navy">
              {stats ? `${stats.successfulRides.toLocaleString("en-IN")}+` : "—"}
            </span>
            <span className="text-sm text-rd-gray">successful rides completed</span>
          </Reveal>
          <Reveal delayMs={80} className="flex items-baseline gap-3">
            <span className="font-display text-3xl font-semibold text-rd-navy">{rideOptionCount}</span>
            <span className="text-sm text-rd-gray">ride types — Bike, Scooty, Auto, Car</span>
          </Reveal>
        </div>
      </section>

      {/* ======================== CHOOSE YOUR RIDE ========================= */}
      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <h2 className="max-w-lg font-display text-4xl font-medium text-rd-navy sm:text-5xl">
              Choose your ride.
            </h2>
          </Reveal>
          <Reveal delayMs={60}>
            <p className="mt-3 max-w-md text-base text-rd-gray">
              From quick errands to day-long plans, Ridora has a ride for every occasion.
            </p>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
            {/* Featured vehicle — large, asymmetric weight, not a fourth
                identical card. */}
            <Reveal delayMs={80}>
              <div className="aspect-[6/5] w-full max-w-md">
                {(() => {
                  const Art = VEHICLE_ART[FEATURED_RIDE.kind];
                  return <Art className="h-full w-full" />;
                })()}
              </div>
              <p className="mt-5 font-display text-2xl font-medium text-rd-navy">{FEATURED_RIDE.label}</p>
              <p className="mt-1.5 max-w-sm text-sm text-rd-gray">{FEATURED_RIDE.blurb}</p>
            </Reveal>

            {/* The rest — a plain, divided list, not boxed cards. */}
            <div className="flex flex-col divide-y divide-rd-line border-t border-rd-line">
              {OTHER_RIDES.map((option, i) => {
                const Art = VEHICLE_ART[option.kind];
                return (
                  <Reveal key={option.kind} delayMs={140 + i * 70} as="div" className="flex items-center gap-5 py-6">
                    <div className="h-16 w-24 shrink-0">
                      <Art className="h-full w-full" />
                    </div>
                    <div>
                      <p className="font-display text-lg font-medium text-rd-navy">{option.label}</p>
                      <p className="mt-0.5 text-sm text-rd-gray">{option.blurb}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ========================= HOW RIDORA WORKS ======================== */}
      <section className="bg-rd-bg py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <h2 className="max-w-lg font-display text-4xl font-medium text-rd-navy sm:text-5xl">
              How Ridora works.
            </h2>
          </Reveal>
          <Reveal delayMs={60}>
            <p className="mt-3 max-w-md text-base text-rd-gray">Get a ride in just a few taps.</p>
          </Reveal>

          <div className="mt-16 grid grid-cols-1 gap-14 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16">
            <div className="flex flex-col gap-10">
              {JOURNEY_STEPS.map((step, i) => (
                <Reveal key={step.n} delayMs={i * 100} as="div" className="flex gap-5">
                  <span className="font-meter text-sm text-rd-teal-dark">{step.n}</span>
                  <div>
                    <p className="font-display text-xl font-medium text-rd-navy">{step.title}</p>
                    <p className="mt-1 text-sm text-rd-gray">{step.body}</p>
                  </div>
                </Reveal>
              ))}
              <Reveal delayMs={320}>
                <CtaButton href="https://app.ridora.in" size="md">
                  Book a Ride
                </CtaButton>
              </Reveal>
            </div>

            <Reveal delayMs={140} className="flex justify-center">
              <PhoneMapVisual className="w-full max-w-[240px]" />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============================== DRIVER ============================== */}
      <section className="bg-rd-navy py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
          <div>
            <Reveal>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-rd-teal-light">
                For drivers
              </span>
            </Reveal>
            <Reveal delayMs={60}>
              <h2 className="mt-4 font-display text-4xl font-medium text-white sm:text-5xl">Drive with Ridora.</h2>
            </Reveal>
            <Reveal delayMs={100}>
              <p className="mt-4 max-w-sm text-base text-white/70">
                Work on your schedule. Choose your vehicle. Grow with every ride.
              </p>
            </Reveal>
            <Reveal delayMs={160}>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <CtaButton href="https://driver.ridora.in">Become a Ridora driver</CtaButton>
                <CtaButton href="/for-drivers" variant="outline-light" arrow={false}>
                  View plans →
                </CtaButton>
              </div>
            </Reveal>
          </div>

          <Reveal delayMs={100}>
            <DriverVisual className="mx-auto aspect-[5/4] w-full max-w-md" />
          </Reveal>
        </div>
      </section>

      {/* ============================== SAFETY ============================== */}
      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-16">
            <div>
              <Reveal>
                <h2 className="font-display text-4xl font-medium leading-[1.05] text-rd-navy sm:text-5xl">
                  Safety comes with
                  <br />
                  every ride.
                </h2>
              </Reveal>
              <Reveal delayMs={60}>
                <p className="mt-4 max-w-md text-base text-rd-gray">
                  Verified drivers, real-time tracking, and in-app support — because your safety
                  matters.
                </p>
              </Reveal>
              <Reveal delayMs={100}>
                <a href="/safety" className="mt-4 inline-block text-sm font-semibold text-rd-teal-dark hover:underline">
                  Learn more →
                </a>
              </Reveal>

              <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
                {SAFETY_FEATURES.map((f, i) => (
                  <Reveal key={f.title} delayMs={140 + i * 60} as="div" className="flex items-start gap-3">
                    <f.icon size={18} className="mt-0.5 shrink-0 text-rd-blue" aria-hidden="true" />
                    <div>
                      <p className="font-display text-sm font-medium text-rd-navy">{f.title}</p>
                      <p className="mt-0.5 text-xs text-rd-gray">{f.body}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>

            <Reveal delayMs={80} className="hidden justify-self-center lg:flex">
              <SafetyShieldArt className="w-28" />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============================== FINAL CTA ============================== */}
      <section className="relative overflow-hidden bg-rd-navy">
        <div className="mx-auto max-w-6xl px-6 pt-20 sm:pt-28">
          <Reveal>
            <h2 className="max-w-xl font-display text-4xl font-medium leading-[1.05] text-white sm:text-5xl">
              Ready to move?
            </h2>
          </Reveal>
          <Reveal delayMs={80}>
            <p className="mt-4 max-w-md text-base text-white/70">
              Book a ride, drive with us, or simply be part of a safer, more connected city.
            </p>
          </Reveal>
          <Reveal delayMs={140}>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <CtaButton href="https://app.ridora.in">Book a Ride</CtaButton>
              <CtaButton href="https://driver.ridora.in" variant="outline-light">
                Drive with Ridora
              </CtaButton>
            </div>
          </Reveal>
        </div>
        <div className="relative mt-16 h-40 overflow-hidden sm:h-56">
          <div className="absolute inset-0 bg-gradient-to-b from-rd-navy via-rd-navy/40 to-transparent" style={{ zIndex: 1 }} />
          <UrbanCloseScene className="absolute inset-0 h-full w-full" />
        </div>
      </section>
    </main>
  );
}
