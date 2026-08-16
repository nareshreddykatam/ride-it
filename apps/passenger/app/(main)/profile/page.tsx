"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button, Card, MeterValue, Skeleton, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getPassengerProfile, getRidePinStatus, setRidePin, type PassengerProfileRow, type RidePinStatus } from "@ride-it/data";

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
      const pin = await setRidePin(supabase);
      setRevealedPin(pin);
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

  return (
    <main className="flex-1 px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Profile</h1>

      <Card className="mt-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-20" />
          </div>
        ) : (
          <>
            <p className="font-display text-lg font-medium text-ink">
              {profile?.full_name ?? "Ride It Passenger"}
            </p>
            <p className="text-sm text-ink-soft">
              {profile?.phone ? `+91 ${profile.phone}` : profile?.email ?? ""}
            </p>
            <div className="mt-2">
              <StatusPill tone="online">★ {profile?.rating?.toFixed(1) ?? "5.0"} rating</StatusPill>
            </div>
          </>
        )}
      </Card>

      <Card className="mt-4">
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 rounded-lg bg-ink/5 p-3 text-center">
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

      <div className="mt-6 flex flex-col gap-2">
        <Link href="/saved-places">
          <Card className="flex items-center justify-between">
            <span className="text-sm text-ink">Saved addresses</span>
            <span className="text-xs text-ink-soft">Manage</span>
          </Card>
        </Link>
        <Link href="/trusted-contacts">
          <Card className="flex items-center justify-between">
            <span className="text-sm text-ink">Trusted contacts</span>
            <span className="text-xs text-ink-soft">Manage</span>
          </Card>
        </Link>
        <Card className="flex items-center justify-between">
          <span className="text-sm text-ink">Payment methods</span>
          <span className="text-xs text-ink-soft">Manage</span>
        </Card>
        <Link href="/notifications">
          <Card className="flex items-center justify-between">
            <span className="text-sm text-ink">Notifications</span>
            <span className="text-xs text-ink-soft">Open</span>
          </Card>
        </Link>
        <Card className="flex items-center justify-between">
          <span className="text-sm text-ink">Help &amp; support</span>
          <span className="text-xs text-ink-soft">Open</span>
        </Card>
        <Link href="/settings">
          <Card className="flex items-center justify-between">
            <span className="text-sm text-ink">Settings</span>
            <span className="text-xs text-ink-soft">Open</span>
          </Card>
        </Link>
      </div>

      <Button variant="outline" className="mt-8 w-full" disabled={signingOut} onClick={handleLogout}>
        {signingOut ? "Signing out…" : "Log out"}
      </Button>
    </main>
  );
}
