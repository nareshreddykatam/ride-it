"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { Button, Card, CardHeader, CardTitle, ConfirmDialog, DriverIcon, MeterValue, Skeleton, StatCard, StatusPill, VEHICLE_VISUALS, WalletIcon } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getDriverProfile,
  listDriverDocuments,
  getDriverDocumentSignedUrl,
  reviewDriverDocument,
  setDriverVerificationStatus,
  setDriverUpiVerified,
  setDriverQrStatus,
  getDriverQrSignedUrl,
  getDriverActiveSubscriptionAdmin,
  getDriverEarningsSummaryAdmin,
  listReviewsReceived,
  getActiveVehicle,
  type DriverProfileRow,
  type DriverDocumentRow,
  type DocumentType,
  type AdminDriverSubscriptionSummary,
  type AdminDriverEarningsSummary,
  type RatingRow,
  type VehicleRow,
} from "@ride-it/data";
import { VEHICLE_TYPE_LABELS_DB } from "@ride-it/types";

const GENDER_LABEL: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
};

function calculateAge(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  aadhaar: "Aadhaar Card",
  driving_license: "Driving License",
  rc: "Vehicle RC",
  insurance: "Insurance",
  selfie: "Selfie Verification",
  vehicle_photo: "Vehicle Photo",
};

const STATUS_TONE = {
  pending: "pending",
  in_review: "pending",
  approved: "verified",
  rejected: "alert",
  suspended: "alert",
} as const;

function DocumentCard({
  doc,
  onReviewed,
}: {
  doc: DriverDocumentRow | undefined;
  type: DocumentType;
  onReviewed: () => void;
}) {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [signedUrl, setSignedUrl] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!doc) return;
    getDriverDocumentSignedUrl(supabase, doc.file_path)
      .then(setSignedUrl)
      .catch(() => setSignedUrl(null));
  }, [supabase, doc]);

  async function handleApprove() {
    if (!doc || !user) return;
    setSubmitting(true);
    try {
      await reviewDriverDocument(supabase, doc.id, user.id, { status: "approved" });
      onReviewed();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmReject() {
    if (!doc || !user || !reason.trim()) return;
    setSubmitting(true);
    try {
      await reviewDriverDocument(supabase, doc.id, user.id, { status: "rejected", rejectionReason: reason.trim() });
      setRejecting(false);
      setReason("");
      onReviewed();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{DOCUMENT_LABELS[doc?.document_type ?? "aadhaar"]}</CardTitle>
        <StatusPill tone={!doc ? "pending" : STATUS_TONE[doc.status] ?? "pending"}>
          {!doc ? "Not uploaded" : doc.status}
        </StatusPill>
      </CardHeader>

      {!doc ? (
        <div className="flex h-28 items-center justify-center rounded-lg bg-ink/5 text-xs text-ink-soft">
          Waiting for driver upload
        </div>
      ) : signedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signedUrl} alt={`${DOCUMENT_LABELS[doc.document_type]} preview`} className="h-28 w-full rounded-lg object-cover" />
      ) : (
        <div className="flex h-28 items-center justify-center rounded-lg bg-ink/5 text-xs text-ink-soft">Loading preview…</div>
      )}

      {doc?.status === "rejected" && doc.rejection_reason && (
        <p className="mt-2 text-xs text-alert-red">Rejected: {doc.rejection_reason}</p>
      )}

      {doc && doc.status !== "approved" && (
        <div className="mt-3">
          {rejecting ? (
            <div className="flex flex-col gap-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for rejection"
                className="h-9 rounded-lg border border-border bg-surface px-3 text-xs outline-none focus:border-signal-blue"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="flex-1" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                  disabled={!reason.trim() || submitting}
                  onClick={handleConfirmReject}
                >
                  Confirm reject
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" disabled={submitting} onClick={() => setRejecting(true)}>
                Reject
              </Button>
              <Button size="sm" className="flex-1" disabled={submitting} onClick={handleApprove}>
                Approve
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * Admin's UPI QR review card — mirrors DocumentCard's signed-URL preview
 * pattern above, but reads/writes the driver-level upi_qr_* columns
 * (20260821090200_driver_payment_methods_and_qr) instead of a
 * driver_documents row. Approve/reject are only reachable if a QR has
 * actually been uploaded (upi_qr_path set) — nothing to review otherwise.
 */
function DriverQrCard({ profile, onReviewed }: { profile: DriverProfileRow; onReviewed: () => void }) {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [signedUrl, setSignedUrl] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!profile.upi_qr_path) return;
    getDriverQrSignedUrl(supabase, profile.upi_qr_path)
      .then(setSignedUrl)
      .catch(() => setSignedUrl(null));
  }, [supabase, profile.upi_qr_path]);

  async function handleApprove() {
    if (!user) return;
    setSubmitting(true);
    try {
      await setDriverQrStatus(supabase, profile.id, user.id, "approved");
      onReviewed();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmReject() {
    if (!user || !reason.trim()) return;
    setSubmitting(true);
    try {
      await setDriverQrStatus(supabase, profile.id, user.id, "rejected", reason.trim());
      setRejecting(false);
      setReason("");
      onReviewed();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mt-6" accent="green">
      <CardHeader>
        <CardTitle>UPI QR Payment</CardTitle>
        {profile.upi_qr_path && <StatusPill tone={STATUS_TONE[profile.upi_qr_status]}>{profile.upi_qr_status.replace("_", " ")}</StatusPill>}
      </CardHeader>

      {!profile.upi_qr_path ? (
        <p className="text-sm text-ink-soft">No QR code uploaded yet.</p>
      ) : (
        <div>
          {signedUrl && (
            /* eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset */
            <img src={signedUrl} alt="Driver's UPI QR code" className="h-40 w-40 rounded-lg border border-border object-contain" />
          )}
          {profile.upi_qr_uploaded_at && (
            <p className="mt-2 text-xs text-ink-soft">Uploaded {new Date(profile.upi_qr_uploaded_at).toLocaleDateString("en-IN")}</p>
          )}
          {profile.upi_qr_status === "rejected" && profile.upi_qr_rejection_reason && (
            <p className="mt-1 text-xs text-alert-red">Rejected: {profile.upi_qr_rejection_reason}</p>
          )}

          {rejecting ? (
            <div className="mt-3">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Rejection reason"
                className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-signal-blue"
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" disabled={submitting} onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                  disabled={submitting || !reason.trim()}
                  onClick={handleConfirmReject}
                >
                  Confirm reject
                </Button>
              </div>
            </div>
          ) : (
            profile.upi_qr_status !== "approved" && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" disabled={submitting} onClick={() => setRejecting(true)}>
                  Reject
                </Button>
                <Button size="sm" className="flex-1" disabled={submitting} onClick={handleApprove}>
                  Approve
                </Button>
              </div>
            )
          )}
        </div>
      )}
    </Card>
  );
}

export default function DriverDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const [profile, setProfile] = React.useState<DriverProfileRow | null>(null);
  const [vehicle, setVehicle] = React.useState<VehicleRow | null>(null);
  const [documents, setDocuments] = React.useState<DriverDocumentRow[]>([]);
  const [subscription, setSubscription] = React.useState<AdminDriverSubscriptionSummary | null>(null);
  const [earnings, setEarnings] = React.useState<AdminDriverEarningsSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notes, setNotes] = React.useState("");
  const [savingStatus, setSavingStatus] = React.useState(false);
  const [busyUpi, setBusyUpi] = React.useState(false);
  const [reviews, setReviews] = React.useState<RatingRow[]>([]);
  const [confirmSuspendOpen, setConfirmSuspendOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const [p, v, docs, sub, earn, revs] = await Promise.all([
      getDriverProfile(supabase, params.id),
      getActiveVehicle(supabase, params.id),
      listDriverDocuments(supabase, params.id),
      getDriverActiveSubscriptionAdmin(supabase, params.id),
      getDriverEarningsSummaryAdmin(supabase, params.id),
      listReviewsReceived(supabase, params.id, 10),
    ]);
    setProfile(p);
    setVehicle(v);
    setDocuments(docs);
    setSubscription(sub);
    setEarnings(earn);
    setNotes(p?.verification_notes ?? "");
    setReviews(revs);
  }, [supabase, params.id]);

  React.useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  async function handleSetStatus(status: DriverProfileRow["verification_status"]) {
    setSavingStatus(true);
    try {
      await setDriverVerificationStatus(supabase, params.id, status, notes || undefined);
      setConfirmSuspendOpen(false);
      await refresh();
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleToggleUpiVerified() {
    if (!profile) return;
    setBusyUpi(true);
    try {
      await setDriverUpiVerified(supabase, params.id, !profile.upi_verified);
      await refresh();
    } finally {
      setBusyUpi(false);
    }
  }

  const docByType = new Map(documents.map((d) => [d.document_type, d]));

  if (loading) {
    return (
      <div>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2 h-4 w-64" />
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!profile) {
    return <p className="text-sm text-ink-soft">Driver not found.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">{profile.full_name ?? "Unnamed driver"}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Driver ID: {params.id} · {VEHICLE_TYPE_LABELS_DB[profile.vehicle_type]} ·{" "}
            {profile.phone ? `+91 ${profile.phone}` : "—"} · Strikes: {profile.strike_count}
          </p>
        </div>
        <StatusPill tone={STATUS_TONE[profile.verification_status]}>{profile.verification_status.replace("_", " ")}</StatusPill>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Rating"
          value={profile.rating > 0 ? profile.rating.toFixed(1) : "—"}
          icon={Star}
          tone="marigold"
        />
        <StatCard
          label={profile.is_online ? "Online now" : "Offline"}
          value={profile.is_online ? "Online" : "Offline"}
          icon={DriverIcon}
          tone={profile.is_online ? "green" : "blue"}
        />
        <StatCard label="Subscription" value={subscription ? subscription.plan : "None"} icon={WalletIcon} tone="violet" />
        <StatCard
          label={`${earnings?.totalRides ?? 0} completed rides`}
          value={`₹${earnings?.totalEarnings ?? 0}`}
          icon={WalletIcon}
          tone="green"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card accent="blue">
          <CardHeader>
            <CardTitle>Personal information</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-1.5 text-sm">
            <p>
              <span className="text-ink-soft">Name:</span> {profile.full_name ?? "—"}
            </p>
            <p>
              <span className="text-ink-soft">Email:</span> {profile.email ?? "—"}
            </p>
            <p>
              <span className="text-ink-soft">Phone:</span> {profile.phone ? `+91 ${profile.phone}` : "—"}
            </p>
            <p>
              <span className="text-ink-soft">Age:</span> {profile.date_of_birth ? `${calculateAge(profile.date_of_birth)} years` : "—"}
            </p>
            <p>
              <span className="text-ink-soft">Gender:</span> {profile.gender ? GENDER_LABEL[profile.gender] ?? profile.gender : "—"}
            </p>
          </div>
        </Card>

        <Card accent="marigold">
          <CardHeader>
            <CardTitle>Vehicle information</CardTitle>
            {vehicle &&
              (() => {
                const visual = VEHICLE_VISUALS[vehicle.vehicle_type];
                const Icon = visual.icon;
                return (
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ backgroundColor: visual.tintVar, color: visual.colorVar }}
                  >
                    <Icon size={16} />
                  </span>
                );
              })()}
          </CardHeader>
          {vehicle ? (
            <div className="flex flex-col gap-1.5 text-sm">
              <p>
                <span className="text-ink-soft">Type:</span> {VEHICLE_TYPE_LABELS_DB[vehicle.vehicle_type]}
              </p>
              <p>
                <span className="text-ink-soft">Registration:</span> {vehicle.registration_number}
              </p>
              <p>
                <span className="text-ink-soft">Make / Model:</span> {[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—"}
              </p>
              <p>
                <span className="text-ink-soft">Colour:</span> {vehicle.color ?? "—"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">No vehicle on file yet.</p>
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(Object.keys(DOCUMENT_LABELS) as DocumentType[]).map((type) => (
          <DocumentCard key={type} type={type} doc={docByType.get(type)} onReviewed={refresh} />
        ))}
      </div>

      <Card className="mt-6" accent="green">
        <CardHeader>
          <CardTitle>Driver UPI</CardTitle>
          {profile && (
            <StatusPill tone={profile.upi_verified ? "online" : "pending"}>
              {profile.upi_verified ? "Verified" : "Not verified"}
            </StatusPill>
          )}
        </CardHeader>
        <p className="text-sm text-ink">{profile?.upi_id ?? "No UPI ID submitted yet"}</p>
        {profile?.upi_id && (
          <Button
            size="sm"
            variant={profile.upi_verified ? "outline" : undefined}
            className="mt-3"
            disabled={busyUpi}
            onClick={handleToggleUpiVerified}
          >
            {busyUpi ? "Saving…" : profile.upi_verified ? "Revoke verification" : "Verify UPI ID"}
          </Button>
        )}
      </Card>

      <DriverQrCard profile={profile} onReviewed={refresh} />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent reviews</CardTitle>
          <span className="text-xs text-ink-soft">{profile?.total_rides ?? 0} total</span>
        </CardHeader>
        {reviews.length === 0 ? (
          <p className="text-sm text-ink-soft">No reviews yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {reviews.map((r) => (
              <div key={r.id} className="py-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-meter text-sm text-ink">
                    <Star size={13} className="fill-marigold text-marigold" aria-hidden="true" />
                    {r.rating}
                  </span>
                  <span className="text-xs text-ink-soft">{new Date(r.created_at).toLocaleDateString("en-IN")}</span>
                </div>
                {r.comment && <p className="mt-1 text-xs text-ink-soft">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6" accent="violet">
        <CardHeader>
          <CardTitle>Verification decision</CardTitle>
        </CardHeader>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes for this decision (visible to other admins)"
          rows={2}
          className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-sm text-ink outline-none focus:border-signal-blue"
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <Button disabled={savingStatus} onClick={() => handleSetStatus("approved")}>
            Approve driver
          </Button>
          <Button variant="outline" disabled={savingStatus} onClick={() => handleSetStatus("rejected")}>
            Reject driver
          </Button>
          <Button variant="destructive" disabled={savingStatus} onClick={() => setConfirmSuspendOpen(true)}>
            Suspend driver
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmSuspendOpen}
        onOpenChange={setConfirmSuspendOpen}
        title="Suspend this driver?"
        description="They'll be taken offline immediately and won't be able to accept rides until an admin reinstates them."
        confirmLabel="Suspend driver"
        tone="destructive"
        loading={savingStatus}
        onConfirm={() => handleSetStatus("suspended")}
      />
    </div>
  );
}
