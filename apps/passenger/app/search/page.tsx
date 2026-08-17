"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MapPin, Home, Briefcase, Users, GraduationCap, Clock, Search } from "lucide-react";
import { cn } from "@ride-it/ui";
import { MockMap } from "@ride-it/maps";
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

// Placeholder suggestions for Vijayawada (the operating/demo city — Part
// 15) — wire to Google Places Autocomplete once maps integration lands.
const SUGGESTIONS = [
  { id: "1", name: "Benz Circle", distanceKm: 4.1 },
  { id: "2", name: "Vijayawada Railway Station", distanceKm: 3.2 },
  { id: "3", name: "Kanaka Durga Temple, Indrakeeladri", distanceKm: 2.6 },
  { id: "4", name: "PVP Square Mall, MG Road", distanceKm: 5.4 },
  { id: "5", name: "Gannavaram Airport", distanceKm: 18.7 },
];

export default function SearchPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [query, setQuery] = React.useState("");
  const [savedPlaces, setSavedPlaces] = React.useState<SavedPlaceRow[]>([]);
  const [recentLocations, setRecentLocations] = React.useState<RecentLocationRow[]>([]);

  React.useEffect(() => {
    if (!user) return;
    listSavedPlaces(supabase, user.id).then(setSavedPlaces);
    listRecentLocations(supabase, user.id, 8).then(setRecentLocations);
  }, [supabase, user]);

  const filtered = query.trim().length > 0 ? SUGGESTIONS.filter((s) => s.name.toLowerCase().includes(query.toLowerCase())) : SUGGESTIONS;

  function handleSelect(name: string, distanceKm: number, coords?: { lat: number; lng: number }) {
    if (user) {
      // Part 9: dedupe-by-address + last_used_at bump happens server-side
      // in upsert_recent_location() — fire-and-forget, never blocks
      // navigation to the fare screen.
      recordRecentLocation(supabase, {
        address: name,
        lat: coords?.lat ?? 16.5062,
        lng: coords?.lng ?? 80.648,
      }).catch(() => {});
    }
    router.push(`/booking?destination=${encodeURIComponent(name)}&distanceKm=${distanceKm}`);
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <MockMap variant="static" className="h-28" />
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

        {query.trim().length === 0 && savedPlaces.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Saved places</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {savedPlaces.map((place) => {
                const Icon = PLACE_ICONS[place.icon ?? "other"] ?? MapPin;
                return (
                  <button
                    key={place.id}
                    onClick={() => handleSelect(place.address, 3)}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs text-ink hover:border-signal-blue"
                  >
                    <Icon size={13} className="text-signal-blue" /> {place.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {query.trim().length === 0 && recentLocations.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Recent</p>
            <div className="mt-1 flex flex-col">
              {recentLocations.map((loc, i) => (
                <motion.button
                  key={loc.id}
                  onClick={() => handleSelect(loc.address, 3)}
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

        <div className="mt-6 flex flex-col">
          {query.trim().length > 0 && <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">Search results</p>}
          {filtered.map((s, i) => (
            <motion.button
              key={s.id}
              onClick={() => handleSelect(s.name, s.distanceKm)}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "flex items-center gap-3 border-b border-border py-3.5 text-left last:border-b-0"
              )}
            >
              <MapPin size={16} className="shrink-0 text-ink-soft" />
              <div>
                <p className="text-sm text-ink">{s.name}</p>
                <p className="text-xs text-ink-soft">{s.distanceKm} km away</p>
              </div>
            </motion.button>
          ))}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-soft">No matches for &ldquo;{query}&rdquo;</p>
          )}
        </div>
      </motion.div>
    </main>
  );
}
