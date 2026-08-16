"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MapPin, Search } from "lucide-react";
import { cn } from "@ride-it/ui";
import { MockMap } from "@ride-it/maps";

// Placeholder suggestions — wire to Google Places Autocomplete once maps integration lands.
const SUGGESTIONS = [
  { id: "1", name: "Hitech City, Madhapur", distanceKm: 6.2 },
  { id: "2", name: "Banjara Hills Rd No. 12", distanceKm: 2.1 },
  { id: "3", name: "Charminar", distanceKm: 9.8 },
  { id: "4", name: "Rajiv Gandhi International Airport", distanceKm: 24.5 },
  { id: "5", name: "Secunderabad Railway Station", distanceKm: 11.3 },
];

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");

  const filtered = SUGGESTIONS.filter((s) =>
    s.name.toLowerCase().includes(query.toLowerCase())
  );

  function handleSelect(destination: (typeof SUGGESTIONS)[number]) {
    router.push(`/booking?destination=${encodeURIComponent(destination.name)}&distanceKm=${destination.distanceKm}`);
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

        <div className="mt-6 flex flex-col">
          {filtered.map((s, i) => (
            <motion.button
              key={s.id}
              onClick={() => handleSelect(s)}
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
