"use client";

import * as React from "react";
import { Button, Card, CardHeader, CardTitle, MeterValue, Skeleton, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getDriverProfile,
  listDriverDocuments,
  getDriverDocumentSignedUrl,
  reviewDriverDocument,
  setDriverVerificationStatus,
  setDriverUpiVerified,
  getDriverActiveSubscriptionAdmin,
  getDriverEarningsSummaryAdmin,
  listReviewsReceived,
  type DriverProfileRow,
  type DriverDocumentRow,
  type DocumentType,
  type AdminDriverSubscriptionSummary,
  type AdminDriverEarningsSummary,
  type RatingRow,
} from "@ride-it/data";

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  aadhaar: "Aadhaar Card",
  driving_license: "Driving License",
  rc: "Vehicle RC",
  insurance: "Insurance",
  selfie: "Selfie Verification",
};

const STATUS_TONE = {
  pending: "pending",
  in_review: "pending",
  approved: "online",
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
                className="h-9 rounded-lg border border-border bg-white px-3 text-xs outline-none focus:border-signal-blue"
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

export default function DriverDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const [profile, setProfile] = React.useState<DriverProfileRow | null>(null);
  const [documents, setDocuments] = React.useState<DriverDocumentRow[]>([]);
  const [subscription, setSubscription] = React.useState<AdminDriverSubscriptionSummary | null>(null);
  const [earnings, setEarnings] = React.useState<AdminDriverEarningsSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notes, setNotes] = React.useState("");
  const [savingStatus, setSavingStatus] = React.useState(false);
  const [busyUpi, setBusyUpi] = React.useState(false);
  const [reviews, setReviews] = React.useState<RatingRow[]>([]);

  const refresh = React.useCallback(async () => {
    const [p, docs, sub, earn, revs] = await Promise.all([
      getDriverProfile(supabase, params.id),
      listDriverDocuments(supabase, params.id),
      getDriverActiveSubscriptionAdmin(supabase, params.id),
      getDriverEarningsSummaryAdmin(supabase, params.id),
      listReviewsReceived(supabase, params.id, 10),
    ]);
    setProfile(p);
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
            Driver ID: {params.id} · {profile.vehicle_type === "auto" ? "Auto" : "Bike"} ·{" "}
            {profile.phone ? `+91 ${profile.phone}` : "—"} · Strikes: {profile.strike_count}
          </p>
        </div>
        <StatusPill tone={STATUS_TONE[profile.verification_status]}>{profile.verification_status.replace("_", " ")}</StatusPill>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <p className="text-xs text-ink-soft">Rating</p>
          <p className="mt-1 font-meter text-lg text-ink">{profile.rating > 0 ? `★ ${profile.rating.toFixed(1)}` : "—"}</p>
        </Card>
        <Card>
          <p className="text-xs text-ink-soft">Online now</p>
          <p className="mt-1 font-meter text-lg text-ink">{profile.is_online ? "Yes" : "No"}</p>
        </Card>
        <Card>
          <MeterValue value={subscription ? subscription.plan : "None"} label="Subscription" size="sm" />
        </Card>
        <Card>
          <MeterValue value={`₹${earnings?.totalEarnings ?? 0}`} label={`${earnings?.totalRides ?? 0} completed rides`} size="sm" />
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(Object.keys(DOCUMENT_LABELS) as DocumentType[]).map((type) => (
          <DocumentCard key={type} type={type} doc={docByType.get(type)} onReviewed={refresh} />
        ))}
      </div>

      <Card className="mt-6">
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
                  <span className="font-meter text-sm text-ink">★ {r.rating}</span>
                  <span className="text-xs text-ink-soft">{new Date(r.created_at).toLocaleDateString("en-IN")}</span>
                </div>
                {r.comment && <p className="mt-1 text-xs text-ink-soft">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Verification decision</CardTitle>
        </CardHeader>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes for this decision (visible to other admins)"
          rows={2}
          className="w-full resize-none rounded-lg border border-border bg-white p-3 text-sm text-ink outline-none focus:border-signal-blue"
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <Button disabled={savingStatus} onClick={() => handleSetStatus("approved")}>
            Approve driver
          </Button>
          <Button variant="outline" disabled={savingStatus} onClick={() => handleSetStatus("rejected")}>
            Reject driver
          </Button>
          <Button variant="destructive" disabled={savingStatus} onClick={() => handleSetStatus("suspended")}>
            Suspend driver
          </Button>
        </div>
      </Card>
    </div>
  );
}
