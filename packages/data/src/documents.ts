import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadFile, createSignedUrl } from "@ride-it/supabase/storage";

export type DocumentType = "aadhaar" | "driving_license" | "rc" | "insurance" | "selfie";
export type DocumentStatus = "pending" | "approved" | "rejected";

export interface DriverDocumentRow {
  id: string;
  driver_id: string;
  document_type: DocumentType;
  file_path: string;
  status: DocumentStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const DOCUMENT_COLUMNS =
  "id, driver_id, document_type, file_path, status, rejection_reason, reviewed_by, reviewed_at, created_at";
const BUCKET = "driver-documents";

export async function listDriverDocuments(supabase: SupabaseClient, driverId: string): Promise<DriverDocumentRow[]> {
  const { data, error } = await supabase
    .from("driver_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as DriverDocumentRow[];
}

/**
 * Short-lived signed URL for viewing a document in the private
 * driver-documents bucket. Never made public — this is the sanctioned way
 * to view a document (Admin document review), not a public file_path.
 * Storage RLS (migration 20260806090000) separately restricts who can
 * request a signed URL for whose folder; admins get their own SELECT
 * policy there (driver_documents_storage_select_admin).
 */
export async function getDriverDocumentSignedUrl(
  supabase: SupabaseClient,
  filePath: string,
  expiresInSeconds = 300
): Promise<string> {
  return createSignedUrl(supabase, BUCKET, filePath, expiresInSeconds);
}

/**
 * Admin document review — direct table update, secured by the existing
 * driver_documents_all_admin RLS policy (Phase 3: `using (is_admin())`).
 * No new RPC needed: a driver has no UPDATE policy on this table at all
 * (Phase 3, deliberate), so this can only ever succeed for a real admin
 * session — RLS is already the complete enforcement here.
 */
export async function reviewDriverDocument(
  supabase: SupabaseClient,
  documentId: string,
  reviewerId: string,
  decision: { status: "approved" | "rejected"; rejectionReason?: string }
): Promise<DriverDocumentRow> {
  const { data, error } = await supabase
    .from("driver_documents")
    .update({
      status: decision.status,
      rejection_reason: decision.status === "rejected" ? decision.rejectionReason ?? null : null,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .select(DOCUMENT_COLUMNS)
    .single();

  if (error) throw error;
  return data as unknown as DriverDocumentRow;
}

/**
 * Uploads the file to the private driver-documents bucket under this
 * driver's own folder (storage RLS — see migration 20260806090000 —
 * enforces this path scoping independently of what path this function
 * passes), then calls replace_driver_document() (migration
 * 20260806090400) to atomically retire any previous document of this type
 * and insert the new pending row. A plain client-side UPDATE can't do the
 * "retire old row" half — drivers have no general UPDATE policy on
 * driver_documents by design (Phase 3) — hence the RPC.
 */
export async function uploadDriverDocument(
  supabase: SupabaseClient,
  driverId: string,
  documentType: DocumentType,
  file: File
): Promise<DriverDocumentRow> {
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${driverId}/${documentType}-${Date.now()}.${ext}`;

  const { path: filePath } = await uploadFile(supabase, BUCKET, path, file, { contentType: file.type });

  const { data, error } = await supabase.rpc("replace_driver_document", {
    p_document_type: documentType,
    p_file_path: filePath,
  });
  if (error) throw error;
  return data as unknown as DriverDocumentRow;
}
