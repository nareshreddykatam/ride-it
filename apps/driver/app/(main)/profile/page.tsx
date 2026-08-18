"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Star, Bell, ChevronRight } from "lucide-react";
import {
  Button,
  Card,
  Input,
  Skeleton,
  StatusPill,
  PulseDot,
  VEHICLE_VISUALS,
  DriverIcon,
  RideIcon,
  PaymentIcon,
  WalletIcon,
  SafetyIcon,
} from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getDriverProfile, setDriverUpiId, type DriverProfileRow } from "@ride-it/data";
import { VEHICLE_TYPE_LABELS_DB } from "@ride-it/types";

const VERIFICATION_TONE = {
  approved: "verified",
  pending: "pending",
  in_review: "pending",
  rejected: "alert",
  suspended: "alert",
} as const;

const VERIFICATION_LABEL = {
  approved: "Verified",
  pending: "Pending",
  in_review: "In review",
  rejected: "Rejected",
  suspended: "Suspended",
} as const;

export default function DriverProfilePage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [signingOut, setSigningOut] = React.useState(false);
  const [profile, setProfile] = React.useState<DriverProfileRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [editingUpi, setEditingUpi] = React.useState(false);
  const [upiInput, setUpiInput] = React.useState("");
  const [savingUpi, setSavingUpi] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    getDriverProfile(supabase, user.id)
      .then((p) => {
        setProfile(p);
        setUpiInput(p?.upi_id ?? "");
      })
      .finally(() => setLoading(false));
  }, [supabase, user]);

  async function handleSaveUpi() {
    if (!user || !upiInput.trim()) return;
    setSavingUpi(true);
    try {
      await setDriverUpiId(supabase, user.id, upiInput.trim());
      setProfile(await getDriverProfile(supabase, user.id));
      setEditingUpi(false);
    } finally {
      setSavingUpi(false);
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

  const vehicleVisuals = profile ? VEHICLE_VISUALS[profile.vehicle_type] : null;

  return (
    <main className="flex-1 px-6 py-8">
      {/* HEADER — plain bordered identity card: avatar/vehicle icon, name,
          verification and rating. Normal surface, no filled gradient. */}
      {loading ? (
        <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-5">
          <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-5">
          <span
            className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: vehicleVisuals?.tintVar ?? "var(--tint-blue)",
              color: vehicleVisuals?.colorVar ?? "var(--signal-blue)",
            }}
          >
            {vehicleVisuals ? (
              React.createElement(vehicleVisuals.icon, { size: 28 })
            ) : (
              <DriverIcon size={26} aria-hidden="true" />
            )}
            {profile?.is_online && (
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-meter-green">
                <PulseDot tone="green" size={5} className="[&_span]:bg-white" />
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold text-ink">
              {profile?.full_name ?? "Ride It Driver"}
            </p>
            <p className="mt-0.5 text-sm text-ink-soft">
              {profile?.phone ? `+91 ${profile.phone}` : ""}
              {profile ? ` · ${VEHICLE_TYPE_LABELS_DB[profile.vehicle_type]}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {profile && (
                <StatusPill tone={VERIFICATION_TONE[profile.verification_status]}>
                  {VERIFICATION_LABEL[profile.verification_status]}
                </StatusPill>
              )}
              <span className="flex items-center gap-1 text-xs text-ink-soft">
                <Star size={12} className="fill-marigold text-marigold" aria-hidden="true" />
                {(profile?.rating ?? 5).toFixed(1)}
              </span>
              {profile?.is_online && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-meter-green-text">
                  <PulseDot tone="green" size={5} />
                  Online
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* UPI — a genuinely distinct functional block (has its own inline
          edit form), kept as its own card rather than folded into a list. */}
      <Card className="mt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-ink">UPI ID (for Driver UPI rides)</p>
          {profile && (
            <StatusPill tone={profile.upi_verified ? "verified" : "pending"}>
              {profile.upi_verified ? "Verified" : "Not verified"}
            </StatusPill>
          )}
        </div>
        <p className="mt-0.5 text-xs text-ink-soft">
          Passengers paying by Driver UPI pay this ID directly — Ride It never processes that payment. An admin
          must verify it before it can be shown to passengers.
        </p>
        {editingUpi ? (
          <div className="mt-3 flex items-end gap-2">
            <Input
              label="UPI ID"
              size="sm"
              className="flex-1"
              value={upiInput}
              onChange={(e) => setUpiInput(e.target.value)}
              placeholder="yourname@bank"
            />
            <Button size="sm" disabled={savingUpi || !upiInput.trim()} onClick={handleSaveUpi}>
              Save
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-ink">{profile?.upi_id ?? "Not set"}</span>
            <Button size="sm" variant="outline" onClick={() => setEditingUpi(true)}>
              {profile?.upi_id ? "Change" : "Add UPI ID"}
            </Button>
          </div>
        )}
        {profile?.upi_id && (
          <p className="mt-2 text-xs text-ink-soft">Changing your UPI ID requires re-verification by an admin.</p>
        )}
      </Card>

      {/* ACCOUNT — a 2-up tile grid, deliberately shaped differently from
          the list sections below it. */}
      <p className="mb-2 mt-6 px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Account</p>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/profile/edit">
          <Card interactive className="flex h-28 flex-col justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-tint-blue text-signal-blue">
              <DriverIcon size={18} aria-hidden="true" />
            </span>
            <span className="text-sm font-medium text-ink">Personal details</span>
          </Card>
        </Link>
        <Link href="/profile/vehicle">
          <Card interactive className="flex h-28 flex-col justify-between">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{
                backgroundColor: vehicleVisuals?.tintVar ?? "var(--tint-violet)",
                color: vehicleVisuals?.colorVar ?? "var(--violet)",
              }}
            >
              {vehicleVisuals ? React.createElement(vehicleVisuals.icon, { size: 18 }) : <DriverIcon size={18} aria-hidden="true" />}
            </span>
            <span className="text-sm font-medium text-ink">Vehicle information</span>
          </Card>
        </Link>
      </div>

      {/* VERIFICATION — a single status-forward card, not a plain row. */}
      <p className="mb-2 mt-6 px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Verification</p>
      <Link href="/documents">
        <Card
          interactive
          accent={profile?.verification_status === "approved" ? "green" : "marigold"}
          className="flex items-center justify-between gap-3"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-meter-green/10 text-meter-green-text">
              <SafetyIcon size={20} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-medium text-ink">Documents</span>
              <span className="block text-xs text-ink-soft">
                {profile ? VERIFICATION_LABEL[profile.verification_status] : "—"} · Aadhaar, licence, RC, insurance
              </span>
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-ink-soft" aria-hidden="true" />
        </Card>
      </Link>

      {/* EARNINGS & PAYMENTS — one grouped card with an internal divided
          list, visually distinct from the tile grid and the status card
          above it. */}
      <p className="mb-2 mt-6 px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Earnings &amp; payments</p>
      <Card className="p-0">
        {(
          [
            { href: "/payment-settings", label: "Payment methods", icon: PaymentIcon, tone: "marigold" },
            { href: "/subscription", label: "Subscription plan", icon: WalletIcon, tone: "marigold" },
            { href: "/subscription-history", label: "Subscription history", icon: WalletIcon, tone: "blue" },
            { href: "/history", label: "Ride history", icon: RideIcon, tone: "blue" },
          ] satisfies { href: string; label: string; icon: React.ElementType; tone: "blue" | "marigold" }[]
        ).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 last:border-b-0"
          >
            <span className="flex items-center gap-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  item.tone === "marigold" ? "bg-tint-marigold text-marigold-text" : "bg-tint-blue text-signal-blue"
                }`}
              >
                <item.icon size={16} aria-hidden="true" />
              </span>
              <span className="text-sm text-ink">{item.label}</span>
            </span>
            <ChevronRight size={14} className="text-ink-soft" aria-hidden="true" />
          </Link>
        ))}
      </Card>

      {/* MORE — everything else, lowest visual priority. */}
      <p className="mb-2 mt-6 px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">More</p>
      <Link href="/notifications">
        <Card interactive className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-alert-red/10 text-alert-red-text">
              <Bell size={16} aria-hidden="true" />
            </span>
            <span className="text-sm text-ink">Notifications</span>
          </span>
          <ChevronRight size={14} className="text-ink-soft" aria-hidden="true" />
        </Card>
      </Link>

      <Button variant="outline" className="mt-8 w-full" disabled={signingOut} onClick={handleLogout}>
        {signingOut ? "Signing out…" : "Log out"}
      </Button>
    </main>
  );
}
