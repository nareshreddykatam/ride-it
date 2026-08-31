"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { MapPin, GraduationCap, Clock, Search, ArrowRight, Map as MapIcon } from "lucide-react";
import { EmptyState, SkeletonRow, PinGlyph, HomeIcon, OfficeIcon, FriendsIcon } from "@ride-it/ui";
import {
  RideMap,
  isGoogleMapsConfigured,
  createAutocompleteSessionToken,
  searchPlaces,
  resolvePlaceDetails,
  type PlaceSuggestion,
} from "@ride-it/maps";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listSavedPlaces, listRecentLocations, recordRecentLocation, type SavedPlaceRow, type RecentLocationRow } from "@ride-it/data";

const PLACE_ICONS: Record<string, typeof MapPin> = {
  home: HomeIcon,
  office: OfficeIcon,
  work: OfficeIcon,
  friends: FriendsIcon,
  college: GraduationCap,
  other: MapPin,
};

const SEARCH_DEBOUNCE_MS = 300;

/**
 * DEV-ONLY fallback suggestions for Vijayawada (the operating/demo city —
 * Part 15), shown only when Google Maps isn't configured AND
 * NODE_ENV !== "production" — same fallback discipline as
 * geolocation.ts's simulated driver movement: clearly labeled, and
 * structurally unreachable in a production bundle (the NODE_ENV check is
 * compiled away by the bundler). Real destination search always uses
 * Google Places Autocomplete (see searchPlaces()) when Maps is
 * configured; production with no Maps key shows an honest "search
 * unavailable" state instead of ever faking results.
 */
const DEV_FALLBACK_SUGGESTIONS = [
  { id: "1", name: "Benz Circle", lat: 16.5115, lng: 80.6444 },
  { id: "2", name: "Vijayawada Railway Station", lat: 16.5175, lng: 80.6195 },
  { id: "3", name: "Kanaka Durga Temple, Indrakeeladri", lat: 16.5193, lng: 80.6067 },
  { id: "4", name: "PVP Square Mall, MG Road", lat: 16.5062, lng: 80.6480 },
  { id: "5", name: "Gannavaram Airport", lat: 16.5312, lng: 80.7967 },
];
const devFallbackAllowed = process.env.NODE_ENV !== "production";

interface SelectedDestination {
  address: string;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
}

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Pickup mode: reached from booking/confirm's "Edit pickup -> Search
  // pickup" action (Part 2B) — reuses this exact same search UI/geocoding
  // architecture rather than building a second one. `returnQuery` is
  // confirm's own full query string (preserved byte-for-byte except the
  // pickup keys this screen sets) so nothing else already chosen there is
  // lost on return.
  const mode: "pickup" | "destination" = searchParams.get("mode") === "pickup" ? "pickup" : "destination";
  const returnQuery = searchParams.get("return") ?? "";
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [query, setQuery] = React.useState("");
  const [savedPlaces, setSavedPlaces] = React.useState<SavedPlaceRow[]>([]);
  const [recentLocations, setRecentLocations] = React.useState<RecentLocationRow[]>([]);
  const [placesLoading, setPlacesLoading] = React.useState(true);
  const [suggestions, setSuggestions] = React.useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [resolvingId, setResolvingId] = React.useState<string | null>(null);
  const sessionTokenRef = React.useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapsConfigured = React.useMemo(() => isGoogleMapsConfigured(), []);

  React.useEffect(() => {
    if (!user) return;
    Promise.all([listSavedPlaces(supabase, user.id), listRecentLocations(supabase, user.id, 8)])
      .then(([places, recents]) => {
        setSavedPlaces(places);
        setRecentLocations(recents);
      })
      .finally(() => setPlacesLoading(false));
  }, [supabase, user]);

  // Debounced real Places Autocomplete — one request per pause in typing,
  // not per keystroke. A fresh session token is created lazily on the
  // first real search and reused for every keystroke of this session,
  // per Google's session-token billing guidance (see places.ts).
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!mapsConfigured || query.trim().length === 0) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = await createAutocompleteSessionToken();
      }
      const results = await searchPlaces(query, sessionTokenRef.current);
      setSuggestions(results);
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, mapsConfigured]);

  const devFiltered =
    !mapsConfigured && devFallbackAllowed && query.trim().length > 0
      ? DEV_FALLBACK_SUGGESTIONS.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
      : !mapsConfigured && devFallbackAllowed
        ? DEV_FALLBACK_SUGGESTIONS
        : [];

  function goToBooking(dest: SelectedDestination) {
    // Pickup mode (Part 2B): the confirm screen requires a real coordinate
    // for pickup — unlike destination, there is no later text-geocoding
    // fallback for pickup in this architecture. A resolution that only
    // produced text (no lat/lng — the same rare Places-lookup-failure path
    // destination mode already tolerates) has nothing valid to hand back,
    // so it's simply not sent forward rather than silently booking an
    // approximate/wrong pickup.
    if (mode === "pickup") {
      if (dest.lat == null || dest.lng == null) return;
      const next = new URLSearchParams(returnQuery);
      next.set("pickupLat", String(dest.lat));
      next.set("pickupLng", String(dest.lng));
      next.set("pickupAddress", dest.address);
      router.push(`/booking/confirm?${next.toString()}`);
      return;
    }

    if (user) {
      // Part 9: dedupe-by-address + last_used_at bump happens server-side
      // in upsert_recent_location() — fire-and-forget, never blocks
      // navigation to the fare screen. Real coordinates now, not a
      // hardcoded Vijayawada-center fallback for every selection.
      if (dest.lat != null && dest.lng != null) {
        recordRecentLocation(supabase, {
          address: dest.address,
          lat: dest.lat,
          lng: dest.lng,
          placeId: dest.placeId ?? undefined,
        }).catch(() => {});
      }
    }
    const params = new URLSearchParams({ destination: dest.address });
    if (dest.lat != null && dest.lng != null) {
      params.set("destLat", String(dest.lat));
      params.set("destLng", String(dest.lng));
    }
    router.push(`/booking?${params.toString()}`);
  }

  function goToMapSelect() {
    const next = new URLSearchParams();
    next.set("mode", mode);
    next.set("return", returnQuery);
    router.push(`/booking/map-select?${next.toString()}`);
  }

  async function handleSelectSuggestion(suggestion: PlaceSuggestion) {
    setResolvingId(suggestion.placeId);
    try {
      const details = await resolvePlaceDetails(suggestion);
      // Session concluded (a fetchFields() call closes it) — next search starts a fresh one.
      sessionTokenRef.current = null;
      if (details) {
        goToBooking({ address: details.formattedAddress, lat: details.lat, lng: details.lng, placeId: details.placeId });
      } else {
        // Honest degradation: still let the passenger continue with the
        // text they picked — booking/confirm falls back to geocoding it,
        // same as before Places Autocomplete existed.
        goToBooking({ address: suggestion.primaryText, lat: null, lng: null, placeId: null });
      }
    } finally {
      setResolvingId(null);
    }
  }

  function handleSelectKnownPlace(address: string, lat: number, lng: number) {
    goToBooking({ address, lat, lng, placeId: null });
  }

  function handleSelectDevFallback(name: string, lat: number, lng: number) {
    goToBooking({ address: name, lat, lng, placeId: null });
  }

  const showSuggestionsPanel = query.trim().length > 0;

  return (
    <main className="flex flex-1 flex-col px-5 py-6 bg-paper">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        {/* Top Navigation & Mini Map Canvas */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-sm transition-transform active:scale-95"
          >
            <ArrowRight size={18} className="rotate-180 text-ink" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-bold text-ink">{mode === "pickup" ? "Set Pickup Location" : "Set Destination"}</h1>
            <p className="text-xs text-ink-soft">{mode === "pickup" ? "Search for where you'll be picked up" : "Enter where you want to go"}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 shadow-md">
          <RideMap fallbackVariant="static" className="h-28 w-full border-0 rounded-none" />
        </div>

        {/* Connected Route Input Box */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-md">
          {/* Pickup row — only shown as static context in destination mode; in pickup mode the input row below IS the pickup field, so this would be redundant. */}
          {mode === "destination" && (
            <>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                  <PinGlyph tone="pickup" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Pickup Point</p>
                  <p className="truncate text-sm font-semibold text-ink">Current location</p>
                </div>
              </div>

              <div className="relative mx-4 flex items-center">
                <div className="h-px w-full bg-border" />
              </div>
            </>
          )}

          {/* Destination/pickup input row */}
          <div className="flex items-center gap-3 px-4 py-3.5 ring-2 ring-inset ring-transparent focus-within:ring-signal-blue/40">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center">
              <PinGlyph tone={mode === "pickup" ? "pickup" : "drop"} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-signal-blue">{mode === "pickup" ? "Pickup" : "Destination"}</p>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mode === "pickup" ? "Where should we pick you up?" : "Where are you going?"}
                className="w-full bg-transparent font-display text-sm font-semibold text-ink outline-none placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-ink-soft"
              />
            </div>
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/10 text-ink-soft hover:bg-ink/20"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Alternate entry point (Parts 2C / 4) — an independent path, not
            gated behind typing a search query first. */}
        {!showSuggestionsPanel && (
          <button
            onClick={goToMapSelect}
            className="mt-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-signal-blue/40 bg-tint-blue/20 px-3.5 py-3 text-left transition-colors hover:bg-tint-blue/40"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tint-blue text-signal-blue">
              <MapIcon size={16} />
            </span>
            <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
              Choose {mode === "pickup" ? "pickup" : "destination"} on map
            </span>
            <ArrowRight size={14} className="shrink-0 text-signal-blue" />
          </button>
        )}

        {!showSuggestionsPanel && placesLoading && (
          <div className="mt-5 flex flex-col gap-2">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        )}

        {!showSuggestionsPanel && !placesLoading && savedPlaces.length === 0 && recentLocations.length === 0 && (
          <EmptyState
            className="mt-6"
            icon={<MapPin size={22} className="text-signal-blue" />}
            title="No saved places yet"
            description="Save places like Home or Work for instant booking every time you travel."
            action={
              <button
                onClick={() => router.push("/saved-places")}
                className="rounded-xl bg-tint-blue px-4 py-2 text-xs font-bold text-signal-blue transition-colors hover:bg-signal-blue hover:text-white"
              >
                + Add a saved place
              </button>
            }
          />
        )}

        {/* Saved places quick pills */}
        {!showSuggestionsPanel && savedPlaces.length > 0 && (
          <div className="mt-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Saved places</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {savedPlaces.map((place) => {
                const Icon = PLACE_ICONS[place.icon ?? "other"] ?? MapPin;
                return (
                  <button
                    key={place.id}
                    onClick={() => handleSelectKnownPlace(place.address, place.lat, place.lng)}
                    className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-ink shadow-sm transition-all hover:border-signal-blue hover:bg-tint-blue/30 active:scale-95"
                  >
                    <Icon size={14} className="text-signal-blue" /> {place.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Locations list */}
        {!showSuggestionsPanel && recentLocations.length > 0 && (
          <div className="mt-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Recent Destinations</p>
            <div className="mt-2.5 flex flex-col gap-2">
              {recentLocations.map((loc, i) => (
                <motion.button
                  key={loc.id}
                  onClick={() => handleSelectKnownPlace(loc.address, loc.lat, loc.lng)}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 rounded-xl border border-border/80 bg-surface px-3.5 py-3 text-left shadow-sm transition-all hover:border-signal-blue/50 hover:bg-tint-blue/20"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tint-blue text-signal-blue shadow-sm">
                    <Clock size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{loc.label ?? loc.address}</p>
                    {loc.label && <p className="truncate text-xs text-ink-soft">{loc.address}</p>}
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* Search Results Dropdown */}
        {showSuggestionsPanel && (
          <div className="mt-5 flex flex-col">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-soft">Search results</p>

            {mapsConfigured ? (
              <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-md divide-y divide-border/60">
                {searching && <p className="py-6 text-center text-sm text-ink-soft">Searching nearby locations…</p>}
                {!searching &&
                  suggestions.map((s) => (
                    <button
                      key={s.placeId}
                      onClick={() => handleSelectSuggestion(s)}
                      disabled={resolvingId === s.placeId}
                      className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-tint-blue/30 disabled:opacity-50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tint-blue text-signal-blue">
                        <PinGlyph tone="drop" size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-sm font-semibold text-ink">{s.primaryText}</p>
                        {s.secondaryText && <p className="truncate text-xs text-ink-soft">{s.secondaryText}</p>}
                      </div>
                      {resolvingId === s.placeId && <span className="ml-auto text-xs font-semibold text-signal-blue">Loading…</span>}
                    </button>
                  ))}
                {!searching && suggestions.length === 0 && (
                  <p className="py-6 text-center text-sm text-ink-soft">No matches for &ldquo;{query}&rdquo;</p>
                )}
              </div>
            ) : devFallbackAllowed ? (
              <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-md">
                <p className="border-b border-border/80 bg-marigold/10 px-4 py-2 text-xs font-semibold text-marigold-text">
                  Demo suggestions for Vijayawada
                </p>
                <div className="divide-y divide-border/60">
                  {devFiltered.map((s, i) => (
                    <motion.button
                      key={s.id}
                      onClick={() => handleSelectDevFallback(s.name, s.lat, s.lng)}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-tint-blue/30"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tint-blue text-signal-blue">
                        <PinGlyph tone="drop" size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-sm font-semibold text-ink">{s.name}</p>
                        <p className="text-xs text-ink-soft">Vijayawada Landmark</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
                {devFiltered.length === 0 && (
                  <p className="py-6 text-center text-sm text-ink-soft">No matches for &ldquo;{query}&rdquo;</p>
                )}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-ink-soft">
                Destination search isn&apos;t available right now. Please try again shortly.
              </p>
            )}
          </div>
        )}
      </motion.div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageContent />
    </Suspense>
  );
}
