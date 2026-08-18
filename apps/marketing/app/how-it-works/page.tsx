import type { ElementType } from "react";
import { Star } from "lucide-react";
import {
  AutoIcon,
  BikeIcon,
  Card,
  DriverIcon,
  LocationIcon,
  PaymentIcon,
  SafetyIcon,
  WalletIcon,
} from "@ride-it/ui";

interface Step {
  title: string;
  body: string;
  icon: ElementType;
  tint: string;
}

const PASSENGER_STEPS: Step[] = [
  {
    title: "Search your destination",
    body: "Enter where you're headed and instantly see fare estimates for Bike and Auto — base fare plus distance, no surge.",
    icon: LocationIcon,
    tint: "bg-tint-blue text-signal-blue",
  },
  {
    title: "Get matched with a nearby driver",
    body: "We match you with the closest available driver and show their live location.",
    icon: DriverIcon,
    tint: "bg-tint-violet text-violet-text",
  },
  {
    title: "Verify with your OTP",
    body: "Share the OTP shown in your app with the driver to start the trip safely.",
    icon: SafetyIcon,
    tint: "bg-meter-green/10 text-meter-green-text",
  },
  {
    title: "Ride and pay",
    body: "Track your trip live, then pay by cash or UPI when you arrive.",
    icon: PaymentIcon,
    tint: "bg-tint-marigold text-marigold-text",
  },
  {
    title: "Rate your experience",
    body: "A quick rating helps keep the platform safe and reliable for everyone.",
    icon: Star,
    tint: "bg-cyan/10 text-cyan-text",
  },
];

const DRIVER_STEPS: Step[] = [
  {
    title: "Register and verify",
    body: "Sign up with your Aadhaar, driving license, RC, and insurance. Verification is reviewed by our team.",
    icon: SafetyIcon,
    tint: "bg-meter-green/10 text-meter-green-text",
  },
  {
    title: "Choose a subscription",
    body: "Pick Daily, Weekly, Monthly, or Yearly — one flat fee, no per-ride commission.",
    icon: WalletIcon,
    tint: "bg-tint-marigold text-marigold-text",
  },
  {
    title: "Go online",
    body: "Toggle online whenever you want to drive. Ride requests come to you.",
    icon: DriverIcon,
    tint: "bg-tint-violet text-violet-text",
  },
  {
    title: "Accept and drive",
    body: "Accept a request, navigate to pickup, verify the rider's OTP, and start the trip.",
    icon: AutoIcon,
    tint: "bg-tint-blue text-signal-blue",
  },
  {
    title: "Keep 100% of the fare",
    body: "Whatever the passenger pays — cash or UPI — is yours. Ride It doesn't take a cut.",
    icon: PaymentIcon,
    tint: "bg-cyan/10 text-cyan-text",
  },
];

/**
 * Bento composition: the first step is a wide featured panel (bigger icon,
 * more room to breathe), the remaining steps sit in a tighter, smaller-scale
 * row underneath. Deliberately not five equal-weight cards in a uniform
 * grid — the first step in each flow (search / register) is the one that
 * actually blocks everything after it, so it gets the visual weight.
 */
function StepGrid({ steps }: { steps: Step[] }) {
  const first = steps[0]!;
  const rest = steps.slice(1);
  return (
    <div className="mt-6">
      <Card tone="tinted" className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
        <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${first.tint}`}>
          <first.icon size={28} aria-hidden="true" />
        </span>
        <div>
          <p className="font-meter text-xs text-ink-soft">Step 01</p>
          <h3 className="mt-1 font-display text-xl font-medium text-ink sm:text-2xl">{first.title}</h3>
          <p className="mt-1.5 text-sm text-ink-soft sm:max-w-md">{first.body}</p>
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {rest.map((step, i) => (
          <Card key={step.title} tone="elevated" className="flex flex-col">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${step.tint}`}>
              <step.icon size={18} aria-hidden="true" />
            </span>
            <p className="mt-3 font-meter text-xs text-ink-soft">
              Step {String(i + 2).padStart(2, "0")}
            </p>
            <h3 className="mt-1 font-display text-sm font-medium text-ink">{step.title}</h3>
            <p className="mt-1.5 text-xs text-ink-soft">{step.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <main>
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <p className="font-meter text-xs font-medium uppercase tracking-wide text-white/80">
            The full picture
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-5xl font-medium leading-[1.02] text-white sm:text-6xl">
            How Ride It works
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/80">
            One platform, two very different economics: passengers get
            simple, transparent fares; drivers keep everything they earn.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <section>
          <h2 className="font-display text-2xl font-medium text-ink sm:text-3xl">For passengers</h2>
          <StepGrid steps={PASSENGER_STEPS} />
        </section>

        {/* Non-textual full-width rhythm break between the two flows —
            no new copy, just a graphic divider. */}
        <div className="my-16 flex items-center justify-center gap-4" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-tint-marigold text-marigold-text">
            <AutoIcon size={20} />
          </span>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-tint-violet text-violet-text">
            <BikeIcon size={20} />
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <section>
          <h2 className="font-display text-2xl font-medium text-ink sm:text-3xl">For drivers</h2>
          <StepGrid steps={DRIVER_STEPS} />
        </section>
      </div>
    </main>
  );
}
