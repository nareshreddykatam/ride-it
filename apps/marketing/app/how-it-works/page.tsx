const PASSENGER_STEPS = [
  { title: "Search your destination", body: "Enter where you're headed and instantly see fare estimates for Bike and Auto — base fare plus distance, no surge." },
  { title: "Get matched with a nearby driver", body: "We match you with the closest available driver and show their live location." },
  { title: "Verify with your OTP", body: "Share the OTP shown in your app with the driver to start the trip safely." },
  { title: "Ride and pay", body: "Track your trip live, then pay by cash or UPI when you arrive." },
  { title: "Rate your experience", body: "A quick rating helps keep the platform safe and reliable for everyone." },
];

const DRIVER_STEPS = [
  { title: "Register and verify", body: "Sign up with your Aadhaar, driving license, RC, and insurance. Verification is reviewed by our team." },
  { title: "Choose a subscription", body: "Pick Daily, Weekly, Monthly, or Yearly — one flat fee, no per-ride commission." },
  { title: "Go online", body: "Toggle online whenever you want to drive. Ride requests come to you." },
  { title: "Accept and drive", body: "Accept a request, navigate to pickup, verify the rider's OTP, and start the trip." },
  { title: "Keep 100% of the fare", body: "Whatever the passenger pays — cash or UPI — is yours. Ride It doesn't take a cut." },
];

export default function HowItWorksPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="font-display text-3xl font-medium text-ink">How Ride It works</h1>
      <p className="mt-2 max-w-xl text-ink-soft">
        One platform, two very different economics: passengers get simple,
        transparent fares; drivers keep everything they earn.
      </p>

      <section className="mt-12">
        <h2 className="font-display text-xl font-medium text-ink">For passengers</h2>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PASSENGER_STEPS.map((step, i) => (
            <div key={step.title}>
              <p className="font-meter text-sm text-signal-blue">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-1 font-display text-base font-medium text-ink">{step.title}</h3>
              <p className="mt-1.5 text-sm text-ink-soft">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-xl font-medium text-ink">For drivers</h2>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {DRIVER_STEPS.map((step, i) => (
            <div key={step.title}>
              <p className="font-meter text-sm text-marigold">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-1 font-display text-base font-medium text-ink">{step.title}</h3>
              <p className="mt-1.5 text-sm text-ink-soft">{step.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
