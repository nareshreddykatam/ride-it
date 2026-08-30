"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Search, User, Clock, ChevronRight, Sparkles, Navigation } from "lucide-react";
import { PinGlyph, HomeIcon, OfficeIcon, FriendsIcon, VEHICLE_VISUALS, type VehicleKind } from "@ride-it/ui";
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
import { RideMap, getCurrentPositionOnce, type LatLng } from "@ride-it/maps";

const PLACE_ICONS: Record<string, typeof HomeIcon> = {
  home: HomeIcon,
  office: OfficeIcon,
  work: OfficeIcon,
  friends: FriendsIcon,
};

const QUICK_VEHICLES: { kind: VehicleKind; tag: string }[] = [
  { kind: "auto", tag: "Popular" },
  { kind: "bike", tag: "Fastest" },
  { kind: "scooty", tag: "Affordable" },
  { kind: "car", tag: "Comfort" },
];

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [lastRide, setLastRide] = React.useState<RideRow | null>(null);
  const [firstName, setFirstName] = React.useState<string | null>(null);
  const [savedPlaces, setSavedPlaces] = React.useState<SavedPlaceRow[]>([]);
  const [recentLocations, setRecentLocations] = React.useState<RecentLocationRow[]>([]);
  const [currentLocation, setCurrentLocation] = React.useState<LatLng | null>(null);

  // One-shot, same pattern as booking/confirm's pickup resolution — just
  // to center the map on the passenger's real surroundings, not tracked
  // continuously (there's no ride yet at this screen).
  React.useEffect(() => {
    getCurrentPositionOnce().then(setCurrentLocation);
  }, []);

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
    <main className="flex flex-1 flex-col overflow-y-auto bg-paper">
      {/* Immersive Map Environment Hero */}
      <div className="relative h-72 w-full shrink-0 overflow-hidden bg-[#0c1628]">
        <RideMap pickup={currentLocation ?? undefined} fallbackVariant="static" className="h-full w-full rounded-none border-0" />

        {/* Top Header Bar Floating over Map */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 bg-gradient-to-b from-[#0c1628]/90 via-[#0c1628]/40 to-transparent pt-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-surface/95 px-3 py-1.5 text-xs font-semibold text-ink shadow-md backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-meter-green animate-pulse" aria-hidden="true" />
              Vijayawada
            </span>
          </div>
          <Link
            href="/profile"
            aria-label="View Profile"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-surface/95 text-ink shadow-md backdrop-blur-md transition-transform active:scale-95"
          >
            <User size={18} className="text-signal-blue" />
          </Link>
        </div>
      </div>

      {/* Elevated Floating Booking Surface */}
      <div className="relative z-10 -mt-10 px-5">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
              {firstName ? `Where to, ${firstName}?` : "Where are you going?"}
            </h1>
            <Sparkles size={18} className="text-marigold" />
          </div>

          <Link
            href="/search"
            className="mt-4 block overflow-hidden rounded-xl border border-border bg-tint-blue/30 transition-all hover:border-signal-blue/40 hover:bg-tint-blue/50"
          >
            <div className="flex items-center gap-3.5 px-4 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                <PinGlyph tone="pickup" size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Pickup</p>
                <p className="truncate text-sm font-medium text-ink">Current location</p>
              </div>
            </div>
            <div className="mx-4 h-px bg-border/80" />
            <div className="flex items-center gap-3.5 px-4 py-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-signal-blue text-white shadow-sm">
                <Search size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Destination</p>
                <p className="truncate font-display text-base font-semibold text-ink">Search destination</p>
              </div>
              <ArrowRight size={18} className="shrink-0 text-signal-blue" />
            </div>
          </Link>
        </div>

        {/* Transportation Fleet Quick Selector */}
        <div className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Select vehicle type</p>
          <div className="mt-2.5 grid grid-cols-4 gap-2.5">
            {QUICK_VEHICLES.map(({ kind, tag }) => {
              const visual = VEHICLE_VISUALS[kind];
              const Icon = visual.icon;
              return (
                <Link key={kind} href="/search">
                  <div className="group relative flex flex-col items-center gap-1.5 rounded-xl border border-border/80 bg-surface p-3 shadow-sm transition-all hover:border-ink/20 hover:shadow-md active:scale-95">
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-2xl transition-transform group-hover:scale-105"
                      style={{ backgroundColor: visual.tintVar, color: visual.colorVar }}
                    >
                      <Icon size={32} />
                    </span>
                    <span className="font-display text-xs font-bold text-ink">{visual.label}</span>
                    <span className="rounded-full bg-ink/5 px-1.5 py-0.5 text-[9px] font-medium text-ink-soft">
                      {tag}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Saved Places Shortcuts */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Saved Places</p>
            <Link href="/saved-places" className="text-xs font-semibold text-signal-blue hover:underline">
              Manage
            </Link>
          </div>
          <div className="mt-2.5 flex gap-3 overflow-x-auto pb-1">
            {savedPlaces.slice(0, 4).map((place) => {
              const Icon = PLACE_ICONS[place.icon ?? ""] ?? HomeIcon;
              return (
                <button
                  key={place.id}
                  onClick={() => goToBooking(place.address, place.lat, place.lng)}
                  className="flex shrink-0 items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 shadow-sm transition-all hover:border-signal-blue hover:bg-tint-blue/30"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tint-blue text-signal-blue">
                    <Icon size={16} strokeWidth={2} />
                  </span>
                  <div className="text-left">
                    <p className="max-w-[80px] truncate text-xs font-semibold text-ink">{place.label}</p>
                    <p className="max-w-[80px] truncate text-[10px] text-ink-soft">Book now</p>
                  </div>
                </button>
              );
            })}
            <Link
              href="/saved-places"
              className="flex shrink-0 items-center gap-2 rounded-xl border border-dashed border-border bg-surface/50 px-3.5 py-2.5 text-ink-soft hover:border-ink-soft"
            >
              <Navigation size={14} />
              <span className="text-xs font-medium">Add Place</span>
            </Link>
          </div>
        </div>

        {/* Recent Locations */}
        {recentLocations.length > 0 && (
          <div className="mt-6">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Recent Destinations</p>
            <div className="mt-2.5 flex flex-col gap-2">
              {recentLocations.slice(0, 3).map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => goToBooking(loc.address, loc.lat, loc.lng)}
                  className="flex items-center gap-3 rounded-xl border border-border/80 bg-surface px-3.5 py-3 text-left shadow-sm transition-all hover:border-signal-blue/50 hover:bg-tint-blue/20"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tint-blue text-signal-blue">
                    <Clock size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{loc.label ?? loc.address}</p>
                    {loc.label && <p className="truncate text-xs text-ink-soft">{loc.address}</p>}
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-ink-soft" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Last Ride Activity Card */}
        {lastRide && lastRideVisual && (
          <div className="mt-6">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Last Activity</p>
            <button
              onClick={() => router.push("/history")}
              className="mt-2 flex w-full items-center gap-3.5 rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition-all hover:border-ink/20 hover:shadow-md"
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm"
                style={{ backgroundColor: lastRideVisual.tintVar, color: lastRideVisual.colorVar }}
              >
                <lastRideVisual.icon size={26} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold text-ink">{lastRide.drop_address ?? "Last ride"}</p>
                <p className="text-xs text-ink-soft">
                  {lastRide.status === "cancelled" ? "Cancelled" : "Completed"} · <span className="font-meter font-semibold text-ink">₹{lastRide.total_fare.toFixed(2)}</span>
                </p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-ink-soft" />
            </button>
          </div>
        )}

        <div className="pb-8" />
      </div>
    </main>
  );
}
