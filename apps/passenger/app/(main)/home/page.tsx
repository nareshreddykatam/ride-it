"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Search, User, Clock, ChevronRight } from "lucide-react";
import { PinGlyph, HomeIcon, OfficeIcon, FriendsIcon, AutoIcon, BikeIcon, VEHICLE_VISUALS } from "@ride-it/ui";
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
  { label: "Bike", icon: BikeIcon, color: "var(--violet)", tint: "var(--tint-violet)" },
  { label: "Auto", icon: AutoIcon, color: "var(--marigold)", tint: "var(--tint-marigold)" },
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

  const lastRideVisual = lastRide ? VEHICLE_VISUALS[lastRide.vehicle_type] : null;

  return (
    <main className="flex flex-1 flex-col overflow-y-auto">
      {/* Minimal top bar — no hero map here. The booking card below is the
          screen's dominant element, not one of several equal-weight cards. */}
      <div className="flex shrink-0 items-center justify-between px-6 pt-5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-meter-green" aria-hidden="true" />
          Vijayawada
        </div>
        <Link href="/profile">
          <motion.div
            whileTap={{ scale: 0.94 }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-tint-blue text-signal-blue"
          >
            <User size={16} />
          </motion.div>
        </Link>
      </div>

      <div className="px-6 pt-3">
        <h1 className="font-display text-[2rem] font-semibold leading-[1.1] tracking-tight text-ink">
          {firstName ? (
            <>
              Where to,
              <br />
              {firstName}?
            </>
          ) : (
            "Where to?"
          )}
        </h1>
      </div>

      {/* Hero booking card — clearly oversized vs. everything below it. */}
      <div className="px-6 pt-5">
        <Link href="/search">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.99 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="overflow-hidden rounded-2xl border border-border bg-surface shadow-lg"
          >
            <div className="flex items-center gap-3.5 px-5 py-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                <PinGlyph tone="pickup" size={20} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">Pickup</p>
                <p className="truncate text-sm font-medium text-ink">Current location</p>
              </div>
            </div>
            <div className="mx-5 h-px bg-border" />
            <div className="flex items-center gap-3.5 px-5 py-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tint-blue text-signal-blue">
                <Search size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">Destination</p>
                <p className="truncate font-display text-base font-semibold text-ink">Search destination</p>
              </div>
              <ArrowRight size={18} className="shrink-0 text-ink-soft" />
            </div>
          </motion.div>
        </Link>

        {/* Vehicle quick-shortcuts — small chips, not competing cards. */}
        <div className="mt-3 flex gap-2">
          {QUICK_VEHICLES.map((v) => {
            const Icon = v.icon;
            return (
              <Link key={v.label} href="/search" className="flex-1">
                <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: v.tint }}>
                  <Icon size={16} strokeWidth={1.8} style={{ color: v.color }} />
                  <span className="text-xs font-medium text-ink">{v.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Saved places — small icon chips, not full cards. */}
      <div className="mt-6 px-6">
        <div className="flex gap-4 overflow-x-auto pb-1">
          {savedPlaces.slice(0, 4).map((place) => {
            const Icon = PLACE_ICONS[place.icon ?? ""] ?? HomeIcon;
            return (
              <button
                key={place.id}
                onClick={() => goToBooking(place.address, place.lat, place.lng)}
                className="flex shrink-0 flex-col items-center gap-1.5"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink/[0.04] text-ink-soft">
                  <Icon size={18} strokeWidth={1.8} />
                </span>
                <span className="max-w-[60px] truncate text-[11px] text-ink-soft">{place.label}</span>
              </button>
            );
          })}
          <Link href="/saved-places" className="flex shrink-0 flex-col items-center gap-1.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-border text-ink-soft">
              <ChevronRight size={16} />
            </span>
            <span className="text-[11px] text-ink-soft">More</span>
          </Link>
        </div>
      </div>

      {/* Recent — lightweight rows, no card chrome. */}
      {recentLocations.length > 0 && (
        <div className="mt-5 px-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Recent</p>
          <div className="mt-1 flex flex-col">
            {recentLocations.slice(0, 3).map((loc, i) => (
              <motion.button
                key={loc.id}
                onClick={() => goToBooking(loc.address, loc.lat, loc.lng)}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 py-2.5 text-left"
              >
                <Clock size={14} className="shrink-0 text-ink-soft" />
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{loc.label ?? loc.address}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Map — demoted to a small, secondary-weight preview, not the hero. */}
      <div className="mt-5 px-6">
        <div className="h-24 overflow-hidden rounded-xl opacity-90">
          <MockMap variant="static" className="h-full rounded-none border-0" />
        </div>
      </div>

      {/* Last ride — a slim single-line summary, not a competing card. */}
      {lastRide && lastRideVisual && (
        <button
          onClick={() => router.push("/history")}
          className="mt-5 flex items-center gap-3 border-t border-border px-6 py-4 text-left"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: lastRideVisual.tintVar, color: lastRideVisual.colorVar }}
          >
            <lastRideVisual.icon size={18} strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-ink">{lastRide.drop_address ?? "Last ride"}</p>
            <p className="text-xs text-ink-soft">
              {lastRide.status === "cancelled" ? "Cancelled" : "Completed"} · ₹{lastRide.total_fare.toFixed(2)}
            </p>
          </div>
          <ChevronRight size={16} className="shrink-0 text-ink-soft" />
        </button>
      )}

      <div className="pb-8" />
    </main>
  );
}
