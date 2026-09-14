"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, MapPin, Star, Clock, ShoppingBag } from "lucide-react";
import { EmptyState, Skeleton, Card } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getNearbyRestaurants, getFoodCategories } from "@ride-it/data";
import { type RestaurantSummary, type FoodCategory } from "@ride-it/types";
import { getCurrentPositionOnce, type LatLng } from "@ride-it/maps";
import { getPublicUrl } from "@ride-it/supabase/storage";

/**
 * Food discovery home. Every restaurant shown here already passed the
 * server-side 15km radius filter (get_nearby_restaurants) — this screen
 * never re-filters or re-sorts by a client-computed distance, it only
 * renders what the RPC returned.
 */
export default function FoodHomePage() {
  const router = useRouter();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [location, setLocation] = React.useState<LatLng | null>(null);
  const [categories, setCategories] = React.useState<FoodCategory[]>([]);
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null);
  const [restaurants, setRestaurants] = React.useState<RestaurantSummary[] | null>(null);
  const [search, setSearch] = React.useState("");
  const [locationError, setLocationError] = React.useState(false);

  React.useEffect(() => {
    getCurrentPositionOnce()
      .then(setLocation)
      .catch(() => setLocationError(true));
    getFoodCategories(supabase).then(setCategories);
  }, [supabase]);

  React.useEffect(() => {
    if (!location) return;
    getNearbyRestaurants(supabase, {
      lat: location.lat,
      lng: location.lng,
      categoryId: activeCategory ?? undefined,
      search: search.trim() || undefined,
    }).then(setRestaurants);
  }, [supabase, location, activeCategory, search]);

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-paper">
      <div className="sticky top-0 z-10 border-b border-border bg-surface/95 px-5 pb-4 pt-5 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Ridora Food</h1>
          <Link
            href="/food/orders"
            aria-label="Your food orders"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-sm active:scale-95"
          >
            <ShoppingBag size={18} className="text-signal-blue" />
          </Link>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-tint-blue/30 px-4 py-3">
          <Search size={16} className="shrink-0 text-ink-soft" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search restaurants"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
          />
        </div>

        {/* Category discovery */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCategory(null)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activeCategory === null ? "border-signal-blue bg-signal-blue text-white" : "border-border bg-surface text-ink-soft"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id === activeCategory ? null : cat.id)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                activeCategory === cat.id ? "border-signal-blue bg-signal-blue text-white" : "border-border bg-surface text-ink-soft"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-5 py-4">
        {locationError && (
          <EmptyState
            icon={<MapPin size={24} />}
            title="Location needed"
            description="Enable location access to see restaurants near you."
          />
        )}

        {!locationError && restaurants === null && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        )}

        {restaurants !== null && restaurants.length === 0 && (
          <EmptyState
            icon={<Search size={24} />}
            title="No restaurants nearby"
            description="We couldn't find any restaurants accepting orders within 15 km of your location."
          />
        )}

        <div className="flex flex-col gap-3">
          {(restaurants ?? []).map((r) => (
            <RestaurantRow key={r.id} restaurant={r} onClick={() => router.push(`/food/restaurant/${r.id}`)} supabase={supabase} />
          ))}
        </div>
      </div>
    </main>
  );
}

function RestaurantRow({
  restaurant,
  onClick,
  supabase,
}: {
  restaurant: RestaurantSummary;
  onClick: () => void;
  supabase: ReturnType<typeof getSupabaseBrowserClient>;
}) {
  const coverUrl = restaurant.coverImagePath ? getPublicUrl(supabase, "restaurant-images", restaurant.coverImagePath) : null;

  return (
    <Card interactive onClick={onClick} className="flex gap-3 p-3">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-tint-blue">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={restaurant.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-signal-blue">
            <ShoppingBag size={22} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-display text-sm font-semibold text-ink">{restaurant.name}</p>
          {!restaurant.isOpen && (
            <span className="shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">Closed</span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
          <Star size={12} className="fill-marigold text-marigold" />
          <span className="font-medium text-ink">{restaurant.rating.toFixed(1)}</span>
          <span>({restaurant.totalRatings})</span>
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-ink-soft">
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {restaurant.avgPreparationMinutes} min
          </span>
          <span className="flex items-center gap-1">
            <MapPin size={12} />
            {restaurant.distanceKm.toFixed(1)} km
          </span>
        </div>
      </div>
    </Card>
  );
}
