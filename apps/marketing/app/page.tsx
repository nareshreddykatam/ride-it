import { CheckCircle2, HeadphonesIcon, MapPinned, ReceiptText, ShieldCheck, Users, Zap } from "lucide-react";
import { HeroMobilityScene } from "../components/illustrations/hero-mobility-scene";
import { PhoneMapVisual } from "../components/illustrations/phone-map-visual";
import { DriverVisual } from "../components/illustrations/driver-visual";
import { SafetyShieldArt } from "../components/illustrations/safety-shield";
import { UrbanCloseScene } from "../components/illustrations/city-scene";
import { BrandBadge } from "../components/illustrations/brand-badge";
import { VEHICLE_ART, type VehicleKind } from "../components/illustrations/vehicles";
import { CtaButton } from "../components/ui/cta-button";
import { Reveal } from "../components/reveal";
import { getPublicRideStats } from "../lib/ride-stats";

// Static generation + background revalidation every 5 minutes — the stat
// "feels live" without a client-side fetch or a DB round-trip on every
// single homepage visit.
export const revalidate = 300;

const TRUST_INDICATORS = [
  { icon: Zap, label: "Fast & reliable" },
  { icon: ShieldCheck, label: "Verified drivers" },
  { icon: ReceiptText, label: "Transparent fares" },
  { icon: Users, label: "Safer rides" },
];

const RIDE_OPTIONS: Array<{ kind: VehicleKind; label: string; blurb: string }> = [
  { kind: "bike", label: "Bike", blurb: "Quick. Affordable. Reliable." },
  { kind: "scooty", label: "Scooty", blurb: "Easy and comfortable." },
  { kind: "auto", label: "Auto", blurb: "Local rides made simple." },
  { kind: "car", label: "Car", blurb: "More space. More comfort." },
];

const JOURNEY_STEPS = [
  {
    n: "01",
    title: "Set your location",
    body: "Tell us where you are and where you're going.",
  },
  {
    n: "02",
    title: "Get matched",
    body: "We connect you with the nearest verified driver.",
  },
  {
    n: "03",
    title: "Enjoy your ride",
    body: "Track your trip live and reach safely.",
  },
];

const DRIVER_PERKS = ["Simple flat-fee subscription", "Flexible hours — go online anytime", "Dedicated in-app support", "Be part of a safer city"];

const SAFETY_FEATURES = [
  { icon: ShieldCheck, title: "Verified drivers", body: "Aadhaar, license, RC and insurance reviewed before anyone goes online." },
  { icon: MapPinned, title: "Live ride tracking", body: "See your driver's location in real time from pickup to drop." },
  { icon: HeadphonesIcon, title: "In-app support", body: "Reach Ridora support directly from the app when you need help." },
  { icon: CheckCircle2, title: "Secure payments", body: "Pay by cash, driver UPI, or online — your choice, every ride." },
];

export default async function MarketingHomePage() {
  const stats = await getPublicRideStats();
  const rideOptionCount = Object.keys(VEHICLE_ART).length;

  return (
    <main>
      {/* ============================== HERO ============================== */}
      <section className="relative overflow-hidden bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 pb-16 pt-14 sm:pb-20 sm:pt-20 lg:grid-cols-2 lg:gap-8 lg:pb-28 lg:pt-24">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full bg-rd-mint px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rd-teal-dark">
                Your city. Your ride.
              </span>
            </Reveal>

            <Reveal delayMs={80}>
              <h1 className="mt-6 font-display text-rd-display font-medium text-rd-navy">
                Move freely.
                <br />
                Ride your way.
              </h1>
            </Reveal>

            <Reveal delayMs={140}>
              <p className="mt-6 max-w-md text-lg text-rd-gray">
                Affordable, reliable and convenient rides across your city. Bike, Scooty, Auto or
                Car — Ridora gets you there.
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

            <Reveal delayMs={260}>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
                {TRUST_INDICATORS.map((t) => (
                  <li key={t.label} className="flex items-center gap-1.5 text-sm text-rd-navy-soft">
                    <t.icon size={16} className="text-rd-teal" aria-hidden="true" />
                    {t.label}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          <Reveal delayMs={120} className="relative">
            <HeroMobilityScene />
            <div className="absolute -right-2 top-2 hidden rotate-3 sm:block lg:-right-6">
              <BrandBadge rotate={4} className="text-xs">
                A smarter city
                <br />
                moves together
              </BrandBadge>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================== STATS ============================== */}
      <section className="border-y border-rd-line bg-rd-bg">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-10 sm:grid-cols-3 sm:gap-6">
          <Reveal className="flex items-center gap-4">
            <span className="font-display text-4xl font-semibold text-rd-navy">
              {stats ? `${stats.successfulRides.toLocaleString("en-IN")}+` : "—"}
            </span>
            <span className="text-sm text-rd-gray">successful rides completed</span>
          </Reveal>
          <Reveal delayMs={80} className="flex items-center gap-4">
            <span className="font-display text-4xl font-semibold text-rd-navy">{rideOptionCount}</span>
            <span className="text-sm text-rd-gray">ride options for every need</span>
          </Reveal>
          <Reveal delayMs={160} className="flex items-center border-t border-rd-line pt-6 text-sm italic text-rd-navy-soft sm:border-t-0 sm:border-l sm:pl-6 sm:pt-0">
            &ldquo;More than just a ride. A better way to move.&rdquo;
          </Reveal>
        </div>
      </section>

      {/* ======================== CHOOSE YOUR RIDE ========================= */}
      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <span className="inline-flex items-center rounded-full bg-rd-mint px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rd-teal-dark">
              Ride your way
            </span>
          </Reveal>
          <Reveal delayMs={60}>
            <h2 className="mt-4 max-w-lg font-display text-4xl font-medium text-rd-navy sm:text-5xl">
              Choose your ride
            </h2>
          </Reveal>
          <Reveal delayMs={100}>
            <p className="mt-3 max-w-lg text-base text-rd-gray">
              From quick errands to day-long plans, Ridora has a ride for every occasion.
            </p>
          </Reveal>

          <div className="mt-12 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {RIDE_OPTIONS.map((option, i) => {
              const Art = VEHICLE_ART[option.kind];
              return (
                <Reveal key={option.kind} delayMs={i * 70}>
                  <div className="group flex h-full flex-col rounded-2xl border border-rd-line bg-white p-5 shadow-rd-card transition-shadow hover:shadow-rd-card-lg sm:p-6">
                    <div className="aspect-[6/5] w-full">
                      <Art className="h-full w-full transition-transform duration-300 group-hover:-translate-y-1" />
                    </div>
                    <p className="mt-4 font-display text-lg font-medium text-rd-navy">{option.label}</p>
                    <p className="mt-1 text-sm text-rd-gray">{option.blurb}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========================= HOW RIDORA WORKS ======================== */}
      <section className="bg-rd-bg py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rd-teal-dark shadow-rd-card">
              Simple. Fast. Reliable.
            </span>
          </Reveal>
          <Reveal delayMs={60}>
            <h2 className="mt-4 max-w-lg font-display text-4xl font-medium text-rd-navy sm:text-5xl">
              How Ridora works
            </h2>
          </Reveal>
          <Reveal delayMs={100}>
            <p className="mt-3 max-w-lg text-base text-rd-gray">Get a ride in just a few taps.</p>
          </Reveal>

          <div className="relative mt-14 grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6">
            {/* Connecting line, desktop only */}
            <div className="pointer-events-none absolute inset-x-0 top-24 hidden h-px bg-rd-line sm:block" aria-hidden="true" />

            <Reveal>
              <StepCard n={JOURNEY_STEPS[0]!.n} title={JOURNEY_STEPS[0]!.title} body={JOURNEY_STEPS[0]!.body}>
                <MiniMapCard />
              </StepCard>
            </Reveal>
            <Reveal delayMs={100}>
              <StepCard n={JOURNEY_STEPS[1]!.n} title={JOURNEY_STEPS[1]!.title} body={JOURNEY_STEPS[1]!.body}>
                <div className="flex h-24 items-center justify-center">
                  <div className="relative w-24">
                    <VEHICLE_ART.scooty className="w-full" />
                    <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-rd-teal text-white shadow-rd-card">
                      <CheckCircle2 size={14} />
                    </span>
                  </div>
                </div>
              </StepCard>
            </Reveal>
            <Reveal delayMs={200}>
              <StepCard n={JOURNEY_STEPS[2]!.n} title={JOURNEY_STEPS[2]!.title} body={JOURNEY_STEPS[2]!.body}>
                <div className="flex h-24 items-center justify-center">
                  <div className="relative w-28">
                    <VEHICLE_ART.car className="w-full" />
                    <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-rd-teal text-white shadow-rd-card">
                      <CheckCircle2 size={14} />
                    </span>
                  </div>
                </div>
              </StepCard>
            </Reveal>
          </div>

          <Reveal delayMs={260} className="mt-12">
            <CtaButton href="https://app.ridora.in" size="md">
              Book a Ride
            </CtaButton>
          </Reveal>
        </div>
      </section>

      {/* ============================== DRIVER ============================== */}
      <section className="bg-rd-navy py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
          <div>
            <Reveal>
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rd-teal-light">
                Drive your future
              </span>
            </Reveal>
            <Reveal delayMs={60}>
              <h2 className="mt-4 font-display text-4xl font-medium text-white sm:text-5xl">Earn on your terms</h2>
            </Reveal>
            <Reveal delayMs={100}>
              <p className="mt-3 max-w-md text-base text-white/70">
                Flexible hours, simple subscription plans, and a growing community of riders.
              </p>
            </Reveal>
            <Reveal delayMs={140}>
              <ul className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {DRIVER_PERKS.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-sm text-white/80">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-rd-teal-light" aria-hidden="true" />
                    {perk}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delayMs={180}>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <CtaButton href="https://driver.ridora.in">Drive with Ridora</CtaButton>
                <CtaButton href="/for-drivers" variant="outline-light" arrow={false}>
                  View subscription plans →
                </CtaButton>
              </div>
            </Reveal>
          </div>

          <Reveal delayMs={100}>
            <DriverVisual className="mx-auto aspect-[4/5] w-full max-w-sm" />
          </Reveal>
        </div>
      </section>

      {/* ============================== SAFETY ============================== */}
      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Reveal className="order-2 flex justify-center lg:order-1">
              <SafetyShieldArt className="w-48 sm:w-56" />
            </Reveal>
            <div className="order-1 lg:order-2">
              <Reveal>
                <span className="inline-flex items-center rounded-full bg-tint-blue px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rd-blue">
                  Ride with confidence
                </span>
              </Reveal>
              <Reveal delayMs={60}>
                <h2 className="mt-4 font-display text-4xl font-medium leading-[1.05] text-rd-navy sm:text-5xl">
                  Safety first,
                  <br />
                  always.
                </h2>
              </Reveal>
              <Reveal delayMs={100}>
                <p className="mt-3 max-w-md text-base text-rd-gray">
                  Verified drivers, real-time tracking, and in-app support — because your safety
                  matters.
                </p>
              </Reveal>

              <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {SAFETY_FEATURES.map((f, i) => (
                  <Reveal key={f.title} delayMs={140 + i * 60}>
                    <div className="flex items-start gap-3 rounded-xl border border-rd-line bg-white p-4 shadow-rd-card">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tint-blue text-rd-blue">
                        <f.icon size={17} aria-hidden="true" />
                      </span>
                      <div>
                        <p className="font-display text-sm font-medium text-rd-navy">{f.title}</p>
                        <p className="mt-0.5 text-xs text-rd-gray">{f.body}</p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================== FINAL CTA ============================== */}
      <section className="relative overflow-hidden bg-rd-navy">
        <div className="mx-auto max-w-6xl px-6 pt-20 sm:pt-28">
          <Reveal>
            <h2 className="max-w-2xl font-display text-4xl font-medium leading-[1.05] text-white sm:text-5xl">
              Let&apos;s keep your city moving.
            </h2>
          </Reveal>
          <Reveal delayMs={80}>
            <p className="mt-4 max-w-lg text-base text-white/70">
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

function StepCard({ n, title, body, children }: { n: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col rounded-2xl border border-rd-line bg-white p-6 shadow-rd-card">
      <span className="font-meter text-xs text-rd-gray">{n}</span>
      <div className="mt-2 flex h-28 items-center justify-center rounded-xl bg-rd-bg">{children}</div>
      <p className="mt-4 font-display text-lg font-medium text-rd-navy">{title}</p>
      <p className="mt-1 text-sm text-rd-gray">{body}</p>
    </div>
  );
}

function MiniMapCard() {
  return (
    <svg viewBox="0 0 100 60" className="h-16 w-24" role="img" aria-label="Pickup location on a map">
      <rect width="100" height="60" rx="8" fill="#F1F6F4" />
      <g stroke="#DCE6E2" strokeWidth="4">
        <path d="M-5 20 H105" />
        <path d="M-5 42 H105" />
        <path d="M30 -5 V65" />
        <path d="M68 -5 V65" />
      </g>
      <path d="M50 20 a9 9 0 1 0 0.01 0" fill="#0F8F78" />
      <path d="M50 10 l-6 10 h12 z" fill="#0F8F78" />
    </svg>
  );
}
