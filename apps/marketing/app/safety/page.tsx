import { ShieldCheck, UserCheck, Star, PhoneCall } from "lucide-react";

const SAFETY_FEATURES = [
  {
    title: "OTP-verified rides",
    body: "Every ride starts only after the passenger shares their OTP with the driver — confirming you're both in the right vehicle.",
    icon: ShieldCheck,
  },
  {
    title: "Driver verification",
    body: "Every driver's Aadhaar, driving license, RC, and insurance are reviewed before they can accept rides.",
    icon: UserCheck,
  },
  {
    title: "Two-way ratings",
    body: "Both passengers and drivers rate each other after every ride, helping keep the community accountable.",
    icon: Star,
  },
  {
    title: "Emergency (SOS) access",
    body: "An SOS option is available during every ride. Full emergency-contact and authority-integration details are still being finalized.",
    icon: PhoneCall,
  },
];

export default function SafetyPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="font-display text-3xl font-medium text-ink">Safety at Ride It</h1>
      <p className="mt-2 max-w-xl text-ink-soft">
        A few of the things built into every ride to keep passengers and
        drivers safe.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {SAFETY_FEATURES.map((f) => (
          <div key={f.title} className="rounded-lg border border-border bg-white p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-signal-blue/10 text-signal-blue">
              <f.icon size={18} aria-hidden="true" />
            </span>
            <h3 className="mt-3 font-display text-base font-medium text-ink">{f.title}</h3>
            <p className="mt-1.5 text-sm text-ink-soft">{f.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
