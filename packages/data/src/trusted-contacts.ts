import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrustedContactRow } from "./types";

const COLUMNS = "id, passenger_id, name, phone, relationship_label, is_active, created_at";

/** Owner-only — trusted_contacts_all_own RLS (Phase 13). Excludes soft-deleted rows. */
export async function listTrustedContacts(supabase: SupabaseClient, passengerId: string): Promise<TrustedContactRow[]> {
  const { data, error } = await supabase
    .from("trusted_contacts")
    .select(COLUMNS)
    .eq("passenger_id", passengerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as TrustedContactRow[];
}

export interface AddTrustedContactInput {
  name: string;
  phone: string;
  relationshipLabel?: string;
}

export async function addTrustedContact(
  supabase: SupabaseClient,
  passengerId: string,
  input: AddTrustedContactInput
): Promise<TrustedContactRow> {
  const { data, error } = await supabase
    .from("trusted_contacts")
    .insert({
      passenger_id: passengerId,
      name: input.name,
      phone: input.phone,
      relationship_label: input.relationshipLabel ?? null,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as TrustedContactRow;
}

export async function updateTrustedContact(
  supabase: SupabaseClient,
  contactId: string,
  patch: Partial<AddTrustedContactInput>
): Promise<void> {
  const update: Record<string, string> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.phone !== undefined) update.phone = patch.phone;
  if (patch.relationshipLabel !== undefined) update.relationship_label = patch.relationshipLabel;
  const { error } = await supabase.from("trusted_contacts").update(update).eq("id", contactId);
  if (error) throw error;
}

/** Soft delete — preserves an audit trail of additions/removals (see migration comment) rather than hard-deleting. */
export async function removeTrustedContact(supabase: SupabaseClient, contactId: string): Promise<void> {
  const { error } = await supabase.from("trusted_contacts").update({ deleted_at: new Date().toISOString() }).eq("id", contactId);
  if (error) throw error;
}
