"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Search, User, Clock, MapPin, Plus } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  MeterValue,
  StatusPill,
  PinGlyph,
  HomeIcon,
  OfficeIcon,
  FriendsIcon,
  AutoIcon,
  BikeIcon,
} from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  listPassengerRides,
  getPassengerProfile,
  isPassengerProfileComplete,
  listSavedPlaces,
  listRecentLocations,
  type RideRow,
  type SavedPlaceRow,
  type RecentLocationRow,
} from "@ride-it/data";
import { MockMap } from "@ride-it/maps";

const PLACE_ICONS: Record<string, typeof HomeIcon> = {
  home: HomeIcon,
  office: OfficeIcon,
  work: OfficeIcon,
  friends: FriendsIcon,
};

const QUICK_VEHICLES = [
  { label: "Bike", eta: "3 min away", icon: BikeIcon, color: "var(--violet)", tint: "var(--tint-violet)" },
  { label: "Auto", eta: "5 min away", icon: AutoIcon, color: "var(--marigold)", tint: "var(--tint-marigold)" },
];

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [lastRide, setLastRide] = React.useState<RideRow | null>(null);
  const [firstName, setFirstName] = React.useState<string | null>(null);
  const [savedPlaces, setSavedPlaces] = React.useState<SavedPlaceRow[]>([]);
  const [recentLocations, setRecentLocations] = React.useState<RecentLocationRow[]>([]);

  // Defensive re-check: an account that reaches Home with an incomplete
  // profile (e.g. browser back/forward, a stale bookmark) is routed into
  // onboarding rather than allowed to continue — the verify screen's own
  // routing is the primary gate, this just closes the gap for any path
  // that bypasses it.
  React.useEffect(() => {
    if (!user) return;
    getPassengerProfile(supabase, user.id).then((profile) => {
      if (profile && !isPassengerProfileComplete(profile)) router.replace("/onboarding");
      if (profile?.full_name) setFirstName(profile.full_name.split(" ")[0] ?? profile.full_name);
    });
  }, [supabase, user, router]);

  React.useEffect(() => {
    if (!user) return;
    listPassengerRides(supabase, user.id, 1).then((rides) => setLastRide(rides[0] ?? null));
    listSavedPlaces(supabase, user.id).then(setSavedPlaces);
    listRecentLocations(supabase, user.id, 4).then(setRecentLocations);
  }, [supabase, user]);

  function goToBooking(address: string, lat: number, lng: number) {
    const query = new URLSearchParams({ destination: address, destLat: String(lat), destLng: String(lng) });
    router.push(`/booking?${query.toString()}`);
  }

  return (
    <main className="flex flex-1 flex-col">
      <div className="relative h-64 shrink-0 overflow-hidden rounded-b-2xl">
        <MockMap variant="static" className="h-full rounded-none border-0" />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{ background: "linear-gradient(180deg, rgba(11,17,32,0.35) 0%, rgba(11,17,32,0) 100%)" }}
          aria-hidden="true"
        />

        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-lg"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-meter-green" aria-hidden="true" />
            Vijayawada
          </motion.div>
          <Link href="/profile">
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              whileTap={{ scale: 0.94 }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink shadow-lg"
            >
              <User size={18} />
            </motion.div>
          </Link>
        </div>
      </div>

      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 22, stiffness: 260 }}
        className="relative z-10 -mt-8 flex-1 rounded-t-2xl bg-paper px-6 pb-6 pt-6 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.12)]"
      >
        <h1 className="font-display text-2xl font-semibold text-ink">
          {firstName ? `Where to, ${firstName}?` : "Where to?"}
        </h1>

        <Link href="/search">
          <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-md transition-shadow hover:shadow-lg">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <PinGlyph tone="pickup" size={18} />
              <span className="text-sm text-ink-soft">Current location</span>
            </div>
            <div className="mx-4 h-px bg-border" />
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Search size={16} className="text-signal-blue" />
              <span className="text-sm font-medium text-ink">Search destination</span>
            </div>
          </div>
        </Link>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {QUICK_VEHICLES.map((v, i) => {
            const Icon = v.icon;
            return (
              <motion.div
                key={v.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
              >
                <Link href="/search">
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm transition-shadow hover:shadow-md">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: v.tint, color: v.color }}
                    >
                      <Icon size={22} strokeWidth={1.7} />
                    </span>
                    <div>
                      <p className="font-display text-sm font-semibold text-ink">{v.label}</p>
                      <p className="text-xs text-ink-soft">{v.eta}</p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Saved places</p>
          <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
            {savedPlaces.slice(0, 4).map((place) => {
              const Icon = PLACE_ICONS[place.icon ?? ""] ?? HomeIcon;
              return (
                <button
                  key={place.id}
                  onClick={() => goToBooking(place.address, place.lat, place.lng)}
                  className="flex shrink-0 flex-col items-center gap-1.5"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-tint-blue text-signal-blue">
                    <Icon size={20} strokeWidth={1.8} />
                  </span>
                  <span className="max-w-[64px] truncate text-xs text-ink-soft">{place.label}</span>
                </button>
              );
            })}
            <Link href="/saved-places" className="flex shrink-0 flex-col items-center gap-1.5">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-border text-ink-soft">
                <Plus size={18} />
              </span>
              <span className="text-xs text-ink-soft">Add</span>
            </Link>
          </div>
        </div>

        {recentLocations.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Recent</p>
            <div className="mt-2 flex flex-col">
              {recentLocations.slice(0, 3).map((loc, i) => (
                <motion.button
                  key={loc.id}
                  onClick={() => goToBooking(loc.address, loc.lat, loc.lng)}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 border-b border-border py-3 text-left last:border-b-0"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/5 text-ink-soft">
                    <Clock size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{loc.label ?? loc.address}</p>
                    {loc.label && <p className="truncate text-xs text-ink-soft">{loc.address}</p>}
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {lastRide && (
          <Card tone="tinted" accent="blue" className="mt-6">
            <CardHeader>
              <CardTitle>Last ride</CardTitle>
              <StatusPill tone={lastRide.status === "cancelled" ? "alert" : "online"}>
                {lastRide.status === "cancelled" ? "Cancelled" : "Completed"}
              </StatusPill>
            </CardHeader>
            <div className="flex items-center gap-2 text-xs text-ink-soft">
              <MapPin size={12} />
              <span className="truncate">{lastRide.drop_address ?? "Destination"}</span>
            </div>
            <div className="mt-3">
              <MeterValue value={`₹${lastRide.total_fare.toFixed(2)}`} label="Total fare" size="lg" />
            </div>
          </Card>
        )}
      </motion.div>
    </main>
  );
}
