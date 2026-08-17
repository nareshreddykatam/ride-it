"use client";

import * as React from "react";
import { Button, Card, Skeleton, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getDriverProfile,
  setDriverPaymentMethods,
  uploadDriverQr,
  getDriverQrSignedUrl,
  type DriverProfileRow,
} from "@ride-it/data";

const QR_STATUS_TONE = {
  approved: "online",
  pending: "pending",
  in_review: "pending",
  rejected: "alert",
  suspended: "alert",
} as const;

const QR_STATUS_LABEL = {
  approved: "Approved",
  pending: "Pending review",
  in_review: "In review",
  rejected: "Rejected",
  suspended: "Suspended",
} as const;

export default function PaymentSettingsPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [profile, setProfile] = React.useState<DriverProfileRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [savingMethods, setSavingMethods] = React.useState(false);
  const [qrPreviewUrl, setQrPreviewUrl] = React.useState<string | null>(null);
  const [uploadingQr, setUploadingQr] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const load = React.useCallback(async () => {
    if (!user) return;
    const p = await getDriverProfile(supabase, user.id);
    setProfile(p);
    if (p?.upi_qr_path) {
      try {
        setQrPreviewUrl(await getDriverQrSignedUrl(supabase, p.upi_qr_path));
      } catch {
        setQrPreviewUrl(null);
      }
    } else {
      setQrPreviewUrl(null);
    }
  }, [supabase, user]);

  React.useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleToggleMethod(method: "cash" | "driver_upi" | "online") {
    if (!user || !profile) return;
    setSavingMethods(true);
    try {
      await setDriverPaymentMethods(supabase, user.id, {
        acceptsCash: method === "cash" ? !profile.accepts_cash : profile.accepts_cash,
        acceptsDriverUpi: method === "driver_upi" ? !profile.accepts_driver_upi : profile.accepts_driver_upi,
        acceptsOnline: method === "online" ? !profile.accepts_online : profile.accepts_online,
      });
      await load();
    } finally {
      setSavingMethods(false);
    }
  }

  async function handleQrFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setUploadingQr(true);
    setUploadError(null);
    try {
      await uploadDriverQr(supabase, user.id, file);
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Couldn't upload the QR image. Try again.");
    } finally {
      setUploadingQr(false);
    }
  }

  if (loading) {
    return (
      <main className="flex-1 px-6 py-8">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-4 h-32 rounded-lg" />
        <Skeleton className="mt-4 h-40 rounded-lg" />
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Payment Methods</h1>
      <p className="mt-1 text-sm text-ink-soft">Choose which payment methods you accept from passengers.</p>

      <Card className="mt-4">
        {(
          [
            { key: "cash" as const, label: "Cash", enabled: profile?.accepts_cash ?? false },
            { key: "driver_upi" as const, label: "UPI (paid directly to you)", enabled: profile?.accepts_driver_upi ?? false },
            { key: "online" as const, label: "Online (Ride It Online / Razorpay)", enabled: profile?.accepts_online ?? false },
          ] as const
        ).map((m) => (
          <label key={m.key} className="flex items-center justify-between border-b border-border py-3 last:border-b-0">
            <span className="text-sm text-ink">{m.label}</span>
            <input
              type="checkbox"
              checked={m.enabled}
              disabled={savingMethods}
              onChange={() => handleToggleMethod(m.key)}
              className="h-5 w-5 accent-signal-blue"
            />
          </label>
        ))}
      </Card>

      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-ink">UPI QR code</p>
          {profile?.upi_qr_path && (
            <StatusPill tone={QR_STATUS_TONE[profile.upi_qr_status]}>{QR_STATUS_LABEL[profile.upi_qr_status]}</StatusPill>
          )}
        </div>
        <p className="mt-0.5 text-xs text-ink-soft">
          Upload a photo of your UPI QR code. An admin must approve it before passengers can pay by scanning it.
        </p>

        {qrPreviewUrl && (
          <div className="mt-3 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset */}
            <img src={qrPreviewUrl} alt="Your UPI QR code" className="h-40 w-40 rounded-lg border border-border object-contain" />
          </div>
        )}

        {profile?.upi_qr_status === "rejected" && profile.upi_qr_rejection_reason && (
          <p className="mt-2 text-xs text-alert-red">Rejected: {profile.upi_qr_rejection_reason}</p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleQrFileSelected}
        />
        <Button
          size="sm"
          variant="outline"
          className="mt-3 w-full"
          disabled={uploadingQr}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadingQr ? "Uploading…" : profile?.upi_qr_path ? "Replace QR code" : "Upload QR code"}
        </Button>
        {profile?.upi_qr_path && (
          <p className="mt-1.5 text-xs text-ink-soft">Replacing your QR code requires re-approval by an admin.</p>
        )}
        {uploadError && <p className="mt-1.5 text-xs text-alert-red">{uploadError}</p>}
      </Card>
    </main>
  );
}
