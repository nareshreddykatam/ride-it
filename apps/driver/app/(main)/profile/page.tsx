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

  return (
    <main className="flex-1 px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Profile</h1>

      <Card tone="elevated" className="mt-4 rounded-2xl">
        {loading ? (
          <div className="flex items-center gap-3">
            <Skeleton className="h-14 w-14 shrink-0 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3.5">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: profile ? VEHICLE_VISUALS[profile.vehicle_type].tintVar : "var(--tint-blue)",
                color: profile ? VEHICLE_VISUALS[profile.vehicle_type].colorVar : "var(--signal-blue)",
              }}
            >
              {profile ? (
                React.createElement(VEHICLE_VISUALS[profile.vehicle_type].icon, { size: 28 })
              ) : (
                <DriverIcon size={26} aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-medium text-ink">
                {profile?.full_name ?? "Ride It Driver"}
              </p>
              <p className="text-sm text-ink-soft">
                {profile?.phone ? `+91 ${profile.phone}` : ""}{" "}
                · {profile ? VEHICLE_TYPE_LABELS_DB[profile.vehicle_type] : ""}
              </p>
              <div className="mt-2 flex items-center gap-2">
                {profile && (
                  <StatusPill tone={VERIFICATION_TONE[profile.verification_status]}>
                    {VERIFICATION_LABEL[profile.verification_status]}
                  </StatusPill>
                )}
                <span className="flex items-center gap-1 text-xs text-ink-soft">
                  <Star size={12} className="fill-marigold text-marigold" aria-hidden="true" />
                  {(profile?.rating ?? 5).toFixed(1)} rating
                </span>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-ink">UPI ID (for Driver UPI rides)</p>
          {profile && (
            <StatusPill tone={profile.upi_verified ? "online" : "pending"}>
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

      <div className="mt-6 flex flex-col gap-2">
        {(
          [
            { href: "/profile/edit", label: "Personal details", action: "Edit", icon: DriverIcon, tone: "blue" },
            {
              href: "/profile/vehicle",
              label: "Vehicle information",
              action: "Manage",
              icon: profile ? VEHICLE_VISUALS[profile.vehicle_type].icon : DriverIcon,
              tone: "violet",
            },
            { href: "/documents", label: "Documents", action: "View", icon: SafetyIcon, tone: "green" },
            { href: "/history", label: "Ride history", action: "View", icon: RideIcon, tone: "blue" },
            { href: "/payment-settings", label: "Payment methods", action: "Manage", icon: PaymentIcon, tone: "marigold" },
            { href: "/subscription", label: "Subscription plan", action: "Manage", icon: WalletIcon, tone: "marigold" },
            { href: "/subscription-history", label: "Subscription history", action: "View", icon: WalletIcon, tone: "blue" },
            { href: "/notifications", label: "Notifications", action: "Open", icon: Bell, tone: "red" },
          ] satisfies { href: string; label: string; action: string; icon: React.ElementType; tone: "blue" | "violet" | "green" | "marigold" | "red" }[]
        ).map((item) => (
          <Link key={item.href} href={item.href}>
            <Card interactive className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    {
                      blue: "bg-tint-blue text-signal-blue",
                      violet: "bg-tint-violet text-violet-text",
                      green: "bg-meter-green/10 text-meter-green-text",
                      marigold: "bg-tint-marigold text-marigold-text",
                      red: "bg-alert-red/10 text-alert-red-text",
                    }[item.tone]
                  }`}
                >
                  <item.icon size={17} aria-hidden="true" />
                </span>
                <span className="text-sm text-ink">{item.label}</span>
              </span>
              <span className="flex items-center gap-1 text-xs text-ink-soft">
                {item.action}
                <ChevronRight size={14} aria-hidden="true" />
              </span>
            </Card>
          </Link>
        ))}
      </div>

      <Button variant="outline" className="mt-8 w-full" disabled={signingOut} onClick={handleLogout}>
        {signingOut ? "Signing out…" : "Log out"}
      </Button>
    </main>
  );
}
