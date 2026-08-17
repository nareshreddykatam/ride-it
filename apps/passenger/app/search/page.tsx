"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MapPin, Home, Briefcase, Users, GraduationCap, Clock, Search } from "lucide-react";
import { cn, EmptyState, SkeletonRow } from "@ride-it/ui";
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
  home: Home,
  office: Briefcase,
  work: Briefcase,
  friends: Users,
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

export default function SearchPage() {
  const router = useRouter();
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
    <main className="flex flex-1 flex-col px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <RideMap fallbackVariant="static" className="h-28" />
        <h1 className="mt-4 font-display text-2xl font-medium text-ink">Where to?</h1>

        <div className="mt-5 flex flex-col gap-2">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3">
            <span className="h-2 w-2 rounded-full bg-meter-green" />
            <span className="text-sm text-ink-soft">Current location</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-signal-blue bg-white px-4 py-3">
            <Search size={16} className="text-ink-soft" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search destination"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
            />
          </div>
        </div>

        {!showSuggestionsPanel && placesLoading && (
          <div className="mt-5 flex flex-col gap-2">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        )}

        {!showSuggestionsPanel && !placesLoading && savedPlaces.length === 0 && recentLocations.length === 0 && (
          <EmptyState
            className="mt-6"
            icon={<MapPin size={20} />}
            title="No saved places yet"
            description="Save places like Home or Work for quick access every time you book a ride."
            action={
              <button
                onClick={() => router.push("/saved-places")}
                className="text-sm font-medium text-signal-blue"
              >
                Add a saved place
              </button>
            }
          />
        )}

        {!showSuggestionsPanel && savedPlaces.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Saved places</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {savedPlaces.map((place) => {
                const Icon = PLACE_ICONS[place.icon ?? "other"] ?? MapPin;
                return (
                  <button
                    key={place.id}
                    onClick={() => handleSelectKnownPlace(place.address, place.lat, place.lng)}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs text-ink hover:border-signal-blue"
                  >
                    <Icon size={13} className="text-signal-blue" /> {place.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!showSuggestionsPanel && recentLocations.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Recent</p>
            <div className="mt-1 flex flex-col">
              {recentLocations.map((loc, i) => (
                <motion.button
                  key={loc.id}
                  onClick={() => handleSelectKnownPlace(loc.address, loc.lat, loc.lng)}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 border-b border-border py-3 text-left last:border-b-0"
                >
                  <Clock size={16} className="shrink-0 text-ink-soft" />
                  <p className="text-sm text-ink">{loc.label ?? loc.address}</p>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {showSuggestionsPanel && (
          <div className="mt-6 flex flex-col">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">Search results</p>

            {mapsConfigured ? (
              <>
                {searching && <p className="py-4 text-center text-sm text-ink-soft">Searching…</p>}
                {!searching &&
                  suggestions.map((s) => (
                    <button
                      key={s.placeId}
                      onClick={() => handleSelectSuggestion(s)}
                      disabled={resolvingId === s.placeId}
                      className="flex items-center gap-3 border-b border-border py-3.5 text-left last:border-b-0 disabled:opacity-50"
                    >
                      <MapPin size={16} className="shrink-0 text-ink-soft" />
                      <div>
                        <p className="text-sm text-ink">{s.primaryText}</p>
                        {s.secondaryText && <p className="text-xs text-ink-soft">{s.secondaryText}</p>}
                      </div>
                      {resolvingId === s.placeId && <span className="ml-auto text-xs text-ink-soft">Loading…</span>}
                    </button>
                  ))}
                {!searching && suggestions.length === 0 && (
                  <p className="py-6 text-center text-sm text-ink-soft">No matches for &ldquo;{query}&rdquo;</p>
                )}
              </>
            ) : devFallbackAllowed ? (
              <>
                <p className="mb-2 rounded-lg bg-marigold/10 px-3 py-2 text-xs text-marigold-text">
                  Demo suggestions — Google Maps isn&apos;t configured. Never shown in production.
                </p>
                {devFiltered.map((s, i) => (
                  <motion.button
                    key={s.id}
                    onClick={() => handleSelectDevFallback(s.name, s.lat, s.lng)}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-3 border-b border-border py-3.5 text-left last:border-b-0"
                  >
                    <MapPin size={16} className="shrink-0 text-ink-soft" />
                    <p className="text-sm text-ink">{s.name}</p>
                  </motion.button>
                ))}
                {devFiltered.length === 0 && (
                  <p className="py-6 text-center text-sm text-ink-soft">No matches for &ldquo;{query}&rdquo;</p>
                )}
              </>
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
