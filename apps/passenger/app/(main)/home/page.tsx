"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Search, User } from "lucide-react";
import { Card, CardHeader, CardTitle, MeterValue, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listPassengerRides, getPassengerProfile, isPassengerProfileComplete, type RideRow } from "@ride-it/data";
import { MockMap } from "@ride-it/maps";

const QUICK_VEHICLES = [
  { label: "Bike", eta: "3 min away" },
  { label: "Auto", eta: "5 min away" },
];

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [lastRide, setLastRide] = React.useState<RideRow | null>(null);

  // Defensive re-check: an account that reaches Home with an incomplete
  // profile (e.g. browser back/forward, a stale bookmark) is routed into
  // onboarding rather than allowed to continue — the verify screen's own
  // routing is the primary gate, this just closes the gap for any path
  // that bypasses it.
  React.useEffect(() => {
    if (!user) return;
    getPassengerProfile(supabase, user.id).then((profile) => {
      if (profile && !isPassengerProfileComplete(profile)) router.replace("/onboarding");
    });
  }, [supabase, user, router]);

  React.useEffect(() => {
    if (!user) return;
    listPassengerRides(supabase, user.id, 1).then((rides) => setLastRide(rides[0] ?? null));
  }, [supabase, user]);

  return (
    <main className="flex flex-1 flex-col">
      <div className="relative h-64 shrink-0">
        <MockMap variant="static" className="h-full rounded-none border-0" />

        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink shadow-md"
          >
            Vijayawada
          </motion.div>
          <Link href="/profile">
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink shadow-md"
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
        className="relative z-10 -mt-6 flex-1 rounded-t-xl bg-paper px-6 pb-6 pt-6 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.12)]"
      >
        <h1 className="font-display text-2xl font-medium text-ink">Where to?</h1>

        <Link href="/search">
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md">
            <Search size={16} className="text-ink-soft" />
            <span className="text-sm text-ink-soft">Search destination</span>
          </div>
        </Link>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {QUICK_VEHICLES.map((v, i) => (
            <motion.div
              key={v.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
            >
              <Link href="/search">
                <div className="rounded-lg border border-border bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
                  <p className="font-display text-sm font-medium text-ink">{v.label}</p>
                  <p className="text-xs text-ink-soft">{v.eta}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {lastRide && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Last ride</CardTitle>
              <StatusPill tone={lastRide.status === "cancelled" ? "alert" : "online"}>
                {lastRide.status === "cancelled" ? "Cancelled" : "Completed"}
              </StatusPill>
            </CardHeader>
            <MeterValue value={`₹${lastRide.total_fare.toFixed(2)}`} label="Total fare" size="lg" />
          </Card>
        )}
      </motion.div>
    </main>
  );
}
