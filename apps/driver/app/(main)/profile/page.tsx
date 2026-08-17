"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Skeleton, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getDriverProfile, setDriverUpiId, type DriverProfileRow } from "@ride-it/data";
import { VEHICLE_TYPE_LABELS_DB } from "@ride-it/types";

const VERIFICATION_TONE = {
  approved: "online",
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

      <Card className="mt-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-24" />
          </div>
        ) : (
          <>
            <p className="font-display text-lg font-medium text-ink">
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
              <span className="text-xs text-ink-soft">★ {profile?.rating?.toFixed(1) ?? "5.0"} rating</span>
            </div>
          </>
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
          <div className="mt-3 flex items-center gap-2">
            <input
              value={upiInput}
              onChange={(e) => setUpiInput(e.target.value)}
              placeholder="yourname@bank"
              className="h-9 flex-1 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-signal-blue"
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
        <Link href="/profile/edit">
          <Card className="flex items-center justify-between">
            <span className="text-sm text-ink">Personal details</span>
            <span className="text-xs text-ink-soft">Edit</span>
          </Card>
        </Link>
        <Link href="/profile/vehicle">
          <Card className="flex items-center justify-between">
            <span className="text-sm text-ink">Vehicle information</span>
            <span className="text-xs text-ink-soft">Manage</span>
          </Card>
        </Link>
        <Link href="/documents">
          <Card className="flex items-center justify-between">
            <span className="text-sm text-ink">Documents</span>
            <span className="text-xs text-ink-soft">View</span>
          </Card>
        </Link>
        <Link href="/history">
          <Card className="flex items-center justify-between">
            <span className="text-sm text-ink">Ride history</span>
            <span className="text-xs text-ink-soft">View</span>
          </Card>
        </Link>
        <Link href="/payment-settings">
          <Card className="flex items-center justify-between">
            <span className="text-sm text-ink">Payment methods</span>
            <span className="text-xs text-ink-soft">Manage</span>
          </Card>
        </Link>
        <Link href="/subscription">
          <Card className="flex items-center justify-between">
            <span className="text-sm text-ink">Subscription plan</span>
            <span className="text-xs text-ink-soft">Manage</span>
          </Card>
        </Link>
        <Link href="/subscription-history">
          <Card className="flex items-center justify-between">
            <span className="text-sm text-ink">Subscription history</span>
            <span className="text-xs text-ink-soft">View</span>
          </Card>
        </Link>
        <Link href="/notifications">
          <Card className="flex items-center justify-between">
            <span className="text-sm text-ink">Notifications</span>
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
