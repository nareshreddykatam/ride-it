import { StatusPill } from "@ride-it/ui";

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
    <main className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="font-display text-3xl font-medium text-ink">Cities we serve</h1>
      <p className="mt-2 max-w-xl text-ink-soft">
        Ride It is launching city by city. Service-area scoping (single-city
        vs. multi-city launch) is still an open item from the PRD review —
        this list reflects a reasonable placeholder rollout plan.
      </p>

      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {CITIES.map((city) => (
          <div key={city.name} className="rounded-lg border border-border bg-white p-4">
            <p className="font-display text-base font-medium text-ink">{city.name}</p>
            <div className="mt-2">
              <StatusPill tone={city.status === "Live" ? "online" : "pending"} dot={false}>
                {city.status}
              </StatusPill>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
