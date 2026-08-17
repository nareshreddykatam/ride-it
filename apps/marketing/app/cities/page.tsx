import { Card, LocationIcon, StatusPill } from "@ride-it/ui";

// Matches the actual launch order seeded in supabase/seed.sql: Vijayawada
// launched first, Hyderabad second (Part 15 — Vijayawada is now the
// operating/demo city).
const CITIES = [
  { name: "Vijayawada", status: "Live" as const },
  { name: "Hyderabad", status: "Coming soon" as const },
  { name: "Bengaluru", status: "Coming soon" as const },
  { name: "Chennai", status: "Coming soon" as const },
];

export default function CitiesPage() {
  return (
    <main>
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <p className="font-meter text-xs font-medium uppercase tracking-wide text-white/80">
            Rolling out city by city
          </p>
          <h1 className="mt-2 font-display text-4xl font-medium text-white sm:text-5xl">
            Cities we serve
          </h1>
          <p className="mt-3 max-w-xl text-white/80">
            Ride It is launching city by city. Service-area scoping
            (single-city vs. multi-city launch) is still an open item from
            the PRD review — this list reflects a reasonable placeholder
            rollout plan.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {CITIES.map((city) => {
            const live = city.status === "Live";
            return (
              <Card
                key={city.name}
                tone="elevated"
                accent={live ? "green" : undefined}
                className="flex flex-col items-start"
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                    live ? "bg-meter-green/10 text-meter-green-text" : "bg-tint-blue text-signal-blue"
                  }`}
                >
                  <LocationIcon size={20} aria-hidden="true" />
                </span>
                <p className="mt-4 font-display text-base font-medium text-ink">{city.name}</p>
                <div className="mt-2">
                  <StatusPill tone={live ? "online" : "pending"} dot={false}>
                    {city.status}
                  </StatusPill>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </main>
  );
}
