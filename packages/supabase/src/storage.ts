import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Storage helpers — generic wrappers over Supabase Storage buckets. Not
 * wired into any screen yet (e.g. the Driver app's document-upload
 * placeholders still show static "Not uploaded" pills), but this gives the
 * eventual integration one typed place to call instead of hand-writing
 * `.storage.from(bucket)` chains across the codebase.
 *
 * Suggested bucket names (to be created in the Supabase dashboard, not by
 * this code): "driver-documents" (private), "avatars" (public).
 */

export interface UploadResult {
  path: string;
  publicUrl: string | null;
}

export async function uploadFile(
  supabase: SupabaseClient<Database>,
  bucket: string,
  path: string,
  file: File | Blob,
  options?: { upsert?: boolean; contentType?: string }
): Promise<UploadResult> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: options?.upsert ?? false,
    contentType: options?.contentType,
  });
  if (error) throw error;

  return {
    path,
    publicUrl: getPublicUrl(supabase, bucket, path),
  };
}

/** Returns null for private buckets — use createSignedUrl instead for those. */
export function getPublicUrl(
  supabase: SupabaseClient<Database>,
  bucket: string,
  path: string
): string | null {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl ?? null;
}

/** For private buckets (e.g. driver KYC documents) — expires after `expiresInSeconds`. */
export async function createSignedUrl(
  supabase: SupabaseClient<Database>,
  bucket: string,
  path: string,
  expiresInSeconds = 60 * 10
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteFile(
  supabase: SupabaseClient<Database>,
  bucket: string,
  paths: string | string[]
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove(Array.isArray(paths) ? paths : [paths]);
  if (error) throw error;
}

export async function listFiles(
  supabase: SupabaseClient<Database>,
  bucket: string,
  folder = ""
) {
  const { data, error } = await supabase.storage.from(bucket).list(folder);
  if (error) throw error;
  return data;
}
