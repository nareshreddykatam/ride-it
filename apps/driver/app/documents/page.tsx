"use client";

import * as React from "react";
import Link from "next/link";
import { Contact, FileText, ShieldCheck, FileCheck2, ScanFace, Car as CarLucide } from "lucide-react";
import { Button, Card, SkeletonRow, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listDriverDocuments, uploadDriverDocument, type DocumentType, type DriverDocumentRow } from "@ride-it/data";

const REQUIRED_DOCUMENTS: { key: DocumentType; label: string; icon: React.ElementType }[] = [
  { key: "aadhaar", label: "Aadhaar Card", icon: Contact },
  { key: "driving_license", label: "Driving License", icon: FileText },
  { key: "rc", label: "Vehicle RC", icon: FileCheck2 },
  { key: "insurance", label: "Insurance", icon: ShieldCheck },
  { key: "selfie", label: "Selfie Verification", icon: ScanFace },
  { key: "vehicle_photo", label: "Vehicle Photo (with number plate)", icon: CarLucide },
];

const STATUS_TONE = { pending: "pending", approved: "verified", rejected: "alert" } as const;
const STATUS_LABEL = { pending: "Pending review", approved: "Approved", rejected: "Rejected" } as const;

export default function DocumentsPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [docs, setDocs] = React.useState<Record<string, DriverDocumentRow>>({});
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState<DocumentType | null>(null);
  const fileInputs = React.useRef<Record<string, HTMLInputElement | null>>({});

  const refresh = React.useCallback(async () => {
    if (!user) return;
    const rows = await listDriverDocuments(supabase, user.id);
    const byType: Record<string, DriverDocumentRow> = {};
    for (const row of rows) byType[row.document_type] = row;
    setDocs(byType);
  }, [supabase, user]);

  React.useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  async function handleFileSelected(documentType: DocumentType, file: File | undefined) {
    if (!user || !file) return;
    setUploading(documentType);
    try {
      await uploadDriverDocument(supabase, user.id, documentType, file);
      await refresh();
    } finally {
      setUploading(null);
    }
  }

  const allApproved = REQUIRED_DOCUMENTS.every((d) => docs[d.key]?.status === "approved");

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Verify your documents</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Upload all {REQUIRED_DOCUMENTS.length} documents to get approved and start accepting rides.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {loading && REQUIRED_DOCUMENTS.map((doc) => <SkeletonRow key={doc.key} />)}
        {!loading && REQUIRED_DOCUMENTS.map((doc) => {
          const uploaded = docs[doc.key];
          const Icon = doc.icon;
          return (
            <Card key={doc.key} className="flex items-center justify-between gap-3 p-4">
              <span className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tint-blue text-signal-blue">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{doc.label}</span>
                  {uploaded ? (
                    <StatusPill tone={STATUS_TONE[uploaded.status]} className="mt-1">
                      {STATUS_LABEL[uploaded.status]}
                    </StatusPill>
                  ) : (
                    <StatusPill tone="offline" className="mt-1">
                      Not uploaded
                    </StatusPill>
                  )}
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <input
                  ref={(el) => {
                    fileInputs.current[doc.key] = el;
                  }}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => handleFileSelected(doc.key, e.target.files?.[0])}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={uploading === doc.key}
                  onClick={() => fileInputs.current[doc.key]?.click()}
                >
                  {uploading === doc.key ? "Uploading…" : uploaded ? "Re-upload" : "Upload"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-auto pt-8">
        <Link href="/subscription">
          <Button className="w-full" disabled={!allApproved}>
            {allApproved ? "Continue" : "Waiting for document approval"}
          </Button>
        </Link>
      </div>
    </main>
  );
}
