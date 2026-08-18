"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Star, User as UserIcon } from "lucide-react";
import { Button, Card, MeterValue, Skeleton, StatusPill, cn } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getPassengerProfile, getRidePinStatus, setRidePin, getMyRidePin, type PassengerProfileRow, type RidePinStatus } from "@ride-it/data";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function PassengerProfilePage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [signingOut, setSigningOut] = React.useState(false);
  const [profile, setProfile] = React.useState<PassengerProfileRow | null>(null);
  const [pinStatus, setPinStatus] = React.useState<RidePinStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [changingPin, setChangingPin] = React.useState(false);
  const [revealedPin, setRevealedPin] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    let active = true;
    Promise.all([getPassengerProfile(supabase, user.id), getRidePinStatus(supabase)])
      .then(([p, pin]) => {
        if (!active) return;
        setProfile(p);
        setPinStatus(pin);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [supabase, user]);

  async function handleChangePin() {
    setChangingPin(true);
    try {
      // set_ride_pin() itself no longer returns the plaintext (migration
      // 20260821090100) — get_my_ride_pin() is now the single path for
      // ever seeing a PIN's plaintext, used here immediately after
      // setting it, same as the active-ride screen uses after acceptance.
      await setRidePin(supabase);
      setRevealedPin(await getMyRidePin(supabase));
      setPinStatus(await getRidePinStatus(supabase));
    } finally {
      setChangingPin(false);
    }
  }

  async function handleLogout() {
    setSigningOut(true);
    try {
      await signOut();
      router.push("/login");
    } catch {
      setSigningOut(false);
    }
  }

  const links = [
    { href: "/profile/edit", label: "Personal details", hint: "Edit" },
    { href: "/saved-places", label: "Saved addresses", hint: "Manage" },
    { href: "/trusted-contacts", label: "Trusted contacts", hint: "Manage" },
    { href: "/notifications", label: "Notifications", hint: "Open" },
    { href: "/settings", label: "Settings", hint: "Open" },
  ];

  return (
    <main className="flex-1 px-6 py-8">
      <h1 className="font-display text-2xl font-semibold text-ink">Profile</h1>

      <Card tone="elevated" className="mt-4">
        {loading ? (
          <div className="flex items-center gap-3">
            <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-tint-blue text-signal-blue">
              <UserIcon size={26} strokeWidth={1.7} />
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold text-ink">
                {profile?.full_name ?? "Ride It Passenger"}
              </p>
              <p className="truncate text-sm text-ink-soft">
                {profile?.phone ? `+91 ${profile.phone}` : profile?.email ?? ""}
              </p>
              <div className="mt-1.5">
                <StatusPill tone="online" dot={false}>
                  <Star size={11} className="fill-current" aria-hidden="true" />
                  {profile?.rating?.toFixed(1) ?? "5.0"} rating
                </StatusPill>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card tone="tinted" className="mt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-ink">Ride PIN</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              Your Ride PIN is used to start your rides. Tell it only to your assigned driver when they arrive.
            </p>
            {pinStatus?.updatedAt && !loading && (
              <p className="mt-1 text-xs text-ink-soft">Last changed {formatDate(pinStatus.updatedAt)}</p>
            )}
          </div>
        </div>
        {revealedPin ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 rounded-lg bg-surface p-3 text-center shadow-sm">
            <MeterValue value={revealedPin} size="md" />
            <p className="mt-2 text-xs text-alert-red">
              Remember this — for your security, we won&apos;t show it to you again.
            </p>
          </motion.div>
        ) : (
          <Button size="sm" variant="outline" className="mt-3" disabled={loading || changingPin} onClick={handleChangePin}>
            {changingPin ? "Generating new PIN…" : "Change Ride PIN"}
          </Button>
        )}
      </Card>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        {links.map((l, i) => (
          <Link key={l.href} href={l.href}>
            <div
              className={cn(
                "flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-ink/[0.03]",
                i !== 0 && "border-t border-border"
              )}
            >
              <span className="text-sm text-ink">{l.label}</span>
              <span className="flex items-center gap-1 text-xs text-ink-soft">
                {l.hint} <ChevronRight size={14} />
              </span>
            </div>
          </Link>
        ))}
        <div className="flex items-center justify-between border-t border-border px-4 py-3.5 opacity-60">
          <span className="text-sm text-ink">Payment methods</span>
          <StatusPill tone="pending" dot={false}>
            Coming soon
          </StatusPill>
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-3.5 opacity-60">
          <span className="text-sm text-ink">Help &amp; support</span>
          <StatusPill tone="pending" dot={false}>
            Coming soon
          </StatusPill>
        </div>
      </div>

      <Button variant="outline" className="mt-8 w-full" disabled={signingOut} onClick={handleLogout}>
        {signingOut ? "Signing out…" : "Log out"}
      </Button>
    </main>
  );
}
