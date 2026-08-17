// Matches the actual launch order seeded in supabase/seed.sql: Vijayawada
// launched first, Hyderabad second (Part 15 — Vijayawada is now the
// operating/demo city).
const CITIES = [
  { name: "Vijayawada", status: "Live" },
  { name: "Hyderabad", status: "Coming soon" },
  { name: "Bengaluru", status: "Coming soon" },
  { name: "Chennai", status: "Coming soon" },
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
            <p className="mt-1 text-xs text-ink-soft">{city.status}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
