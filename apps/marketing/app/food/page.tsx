import { UtensilsCrossed, MapPin, Bike, Store, Users, CreditCard } from "lucide-react";
import { Button, Card } from "@ride-it/ui";

const PASSENGER_APP_URL = "https://app.ridora.in/food";
const DRIVER_APP_URL = "https://driver.ridora.in";
const RESTAURANT_APP_URL = "https://restaurant.ridora.in";

const FEATURES = [
  {
    icon: MapPin,
    title: "Restaurants near you",
    body: "Discover restaurants within 15 km, browse real menus, and order in a few taps.",
  },
  {
    icon: Users,
    title: "Order for anyone",
    body: "Place an order for yourself or send a meal to someone else — just add their name and phone number.",
  },
  {
    icon: CreditCard,
    title: "Pay your way",
    body: "Cash on delivery or pay online — same trusted Ridora checkout.",
  },
];

export default function FoodPage() {
  return (
    <main>
      {/* Distinct Food identity — marigold-on-dark, not a copy of the ride
          hero's ink-blue band, so Food reads as its own service within
          Ridora rather than a reskinned ride screen. */}
      <section className="relative overflow-hidden bg-ink">
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pb-28 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/90">
            <UtensilsCrossed size={13} aria-hidden="true" />
            Ridora Food
          </span>
          <h1 className="mt-6 max-w-3xl font-display text-5xl font-medium leading-[1.02] text-white sm:text-6xl">
            Your favorite food, delivered by <span className="text-marigold">Ridora</span>.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/75">
            Order from restaurants near you, right inside the Ridora Passenger app — the same account you already use for rides.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <a href={PASSENGER_APP_URL}>
              <Button size="lg" variant="marigold">
                Order Food
              </Button>
            </a>
            <a href={DRIVER_APP_URL}>
              <Button size="lg" variant="outline" className="border-white/30 text-white hover:border-white/60 hover:bg-white/10">
                Deliver with Ridora
              </Button>
            </a>
          </div>
        </div>
      </section>

      <section className="bg-paper py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} tone="elevated">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-tint-marigold text-marigold-text">
                  <f.icon size={20} aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-display text-lg font-medium text-ink">{f.title}</h3>
                <p className="mt-1.5 text-sm text-ink-soft">{f.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Driver CTA — same mode a Ridora driver already knows, framed as a
          second earning option, not a separate app to learn. */}
      <section className="bg-tint-blue/40">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-6 py-16 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-signal-blue">
              <Bike size={14} aria-hidden="true" />
              For drivers
            </span>
            <h2 className="mt-3 font-display text-3xl font-medium leading-[1.05] text-ink sm:text-4xl">
              Switch to Food Delivery Mode, earn more
            </h2>
            <p className="mt-3 max-w-md text-ink-soft">
              Already a Ridora driver? Switch between Ride Mode and Food Delivery Mode any time you're not on an active trip.
            </p>
          </div>
          <a href={DRIVER_APP_URL} className="shrink-0">
            <Button size="lg" variant="brand">
              Open Driver app
            </Button>
          </a>
        </div>
      </section>

      {/* Restaurant partner CTA — the primary "Partner with Ridora" surface. */}
      <section className="bg-ink-blue">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-6 py-20 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/90">
              <Store size={13} aria-hidden="true" />
              For restaurants
            </span>
            <h2 className="mt-4 font-display text-4xl font-medium leading-[1.05] text-white sm:text-5xl">
              Partner with Ridora
            </h2>
            <p className="mt-4 max-w-md text-white/75">
              Reach more customers, manage your own menu, and track orders and revenue — all from the Restaurant Partner dashboard.
              New restaurants are reviewed and approved by our team before going live.
            </p>
          </div>
          <a href={RESTAURANT_APP_URL} className="shrink-0">
            <Button size="lg" variant="marigold">
              Register your restaurant
            </Button>
          </a>
        </div>
      </section>
    </main>
  );
}
