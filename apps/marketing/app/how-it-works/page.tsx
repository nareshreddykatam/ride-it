import type { ElementType } from "react";
import { Star } from "lucide-react";
import {
  AutoIcon,
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

function StepGrid({ steps }: { steps: Step[] }) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {steps.map((step, i) => (
        <Card key={step.title} tone="elevated" className="flex flex-col">
          <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${step.tint}`}>
            <step.icon size={20} aria-hidden="true" />
          </span>
          <p className="mt-4 font-meter text-xs text-ink-soft">Step {String(i + 1).padStart(2, "0")}</p>
          <h3 className="mt-1 font-display text-base font-medium text-ink">{step.title}</h3>
          <p className="mt-1.5 text-sm text-ink-soft">{step.body}</p>
        </Card>
      ))}
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <main>
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <p className="font-meter text-xs font-medium uppercase tracking-wide text-white/80">
            The full picture
          </p>
          <h1 className="mt-2 font-display text-4xl font-medium text-white sm:text-5xl">
            How Ride It works
          </h1>
          <p className="mt-3 max-w-xl text-white/80">
            One platform, two very different economics: passengers get
            simple, transparent fares; drivers keep everything they earn.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 py-16">
        <section>
          <h2 className="font-display text-xl font-medium text-ink">For passengers</h2>
          <StepGrid steps={PASSENGER_STEPS} />
        </section>

        <section className="mt-16">
          <h2 className="font-display text-xl font-medium text-ink">For drivers</h2>
          <StepGrid steps={DRIVER_STEPS} />
        </section>
      </div>
    </main>
  );
}
