import type { ElementType } from "react";
import { PhoneCall, Star, UserCheck } from "lucide-react";
import { Card, SafetyIcon } from "@ride-it/ui";

interface SafetyFeature {
  title: string;
  body: string;
  icon: ElementType;
  tint: string;
  accent?: "blue" | "marigold" | "green" | "red" | "violet";
}

const SAFETY_FEATURES: SafetyFeature[] = [
  {
    title: "OTP-verified rides",
    body: "Every ride starts only after the passenger shares their OTP with the driver — confirming you're both in the right vehicle.",
    icon: SafetyIcon,
    tint: "bg-meter-green/10 text-meter-green-text",
  },
  {
    title: "Driver verification",
    body: "Every driver's Aadhaar, driving license, RC, and insurance are reviewed before they can accept rides.",
    icon: UserCheck,
    tint: "bg-tint-blue text-signal-blue",
  },
  {
    title: "Two-way ratings",
    body: "Both passengers and drivers rate each other after every ride, helping keep the community accountable.",
    icon: Star,
    tint: "bg-tint-marigold text-marigold-text",
  },
  {
    title: "Emergency (SOS) access",
    body: "An SOS option is available during every ride. Full emergency-contact and authority-integration details are still being finalized.",
    icon: PhoneCall,
    tint: "bg-alert-red/10 text-alert-red-text",
    accent: "red",
  },
];

export default function SafetyPage() {
  return (
    <main>
      <section className="bg-ink-blue">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/90">
            <SafetyIcon size={13} aria-hidden="true" />
            Built in, not bolted on
          </span>
          <h1 className="mt-4 font-display text-4xl font-medium text-white sm:text-5xl">
            Safety at Ride It
          </h1>
          <p className="mt-3 max-w-xl text-white/80">
            A few of the things built into every ride to keep passengers and
            drivers safe.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {SAFETY_FEATURES.map((f) => (
            <Card key={f.title} tone="elevated" accent={f.accent}>
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${f.tint}`}>
                <f.icon size={20} aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-display text-base font-medium text-ink">{f.title}</h3>
              <p className="mt-1.5 text-sm text-ink-soft">{f.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
