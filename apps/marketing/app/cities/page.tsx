import { Card, LocationIcon, StatusPill } from "@ride-it/ui";

// Matches the actual launch order seeded in supabase/seed.sql: Vijayawada
// launched first, Hyderabad second (Part 15 — Vijayawada is now the
// operating/demo city).
const LIVE_CITY = { name: "Vijayawada", status: "Live" as const };
const UPCOMING_CITIES = [
  { name: "Hyderabad", status: "Coming soon" as const },
  { name: "Bengaluru", status: "Coming soon" as const },
  { name: "Chennai", status: "Coming soon" as const },
];

export default function CitiesPage() {
  return (
    <main>
      <section className="bg-ink-blue">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <p className="font-meter text-xs font-medium uppercase tracking-wide text-white/80">
            Rolling out city by city
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-5xl font-medium leading-[1.02] text-white sm:text-6xl">
            Cities we serve
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/80">
            Ridora is launching city by city. Service-area scoping
            (single-city vs. multi-city launch) is still an open item from
            the PRD review — this list reflects a reasonable placeholder
            rollout plan.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        {/* Featured, operating city gets real visual weight; everything
            else is a smaller, deliberately quieter secondary row — not
            four identical cards. */}
        <Card
          tone="elevated"
          accent="green"
          className="flex flex-col items-start gap-6 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9"
        >
          <div className="flex items-center gap-5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-meter-green/10 text-meter-green-text">
              <LocationIcon size={28} aria-hidden="true" />
            </span>
            <div>
              <p className="font-meter text-xs font-medium uppercase tracking-wide text-meter-green-text">
                Now operating
              </p>
              <p className="mt-1 font-display text-3xl font-medium text-ink sm:text-4xl">
                {LIVE_CITY.name}
              </p>
            </div>
          </div>
          <StatusPill tone="online" dot={false} className="text-sm">
            {LIVE_CITY.status}
          </StatusPill>
        </Card>

        <div className="mt-10">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Coming soon
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {UPCOMING_CITIES.map((city) => (
              <Card key={city.name} tone="outline" className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tint-blue text-signal-blue">
                  <LocationIcon size={16} aria-hidden="true" />
                </span>
                <div>
                  <p className="font-display text-sm font-medium text-ink">{city.name}</p>
                  <StatusPill tone="pending" dot={false} className="mt-1">
                    {city.status}
                  </StatusPill>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
