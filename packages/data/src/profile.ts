import type { SupabaseClient } from "@supabase/supabase-js";
import type { PassengerProfileRow } from "./types";

const PROFILE_COLUMNS = "id, rating, total_rides, default_payment_method, users:id(full_name, phone, email)";

export async function getPassengerProfile(
  supabase: SupabaseClient,
  passengerId: string
): Promise<PassengerProfileRow | null> {
  const { data, error } = await supabase
    .from("passengers")
    .select(PROFILE_COLUMNS)
    .eq("id", passengerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // `users` comes back as a joined row (or array, depending on the
  // relationship direction PostgREST infers) — normalize defensively.
  const joined = data as unknown as {
    id: string;
    rating: number;
    total_rides: number;
    default_payment_method: PassengerProfileRow["default_payment_method"];
    users: { full_name: string | null; phone: string | null; email: string | null } | Array<{ full_name: string | null; phone: string | null; email: string | null }>;
  };
  const userRow = Array.isArray(joined.users) ? joined.users[0] : joined.users;

  return {
    id: joined.id,
    rating: joined.rating,
    total_rides: joined.total_rides,
    default_payment_method: joined.default_payment_method,
    full_name: userRow?.full_name ?? null,
    phone: userRow?.phone ?? null,
    email: userRow?.email ?? null,
  };
}

export interface UpdatePassengerProfileInput {
  fullName?: string;
  defaultPaymentMethod?: PassengerProfileRow["default_payment_method"];
}

/**
 * Built and ready, but not called from any screen yet — see the Phase 5
 * review doc. The existing Profile screen has no editable name/payment
 * fields to wire this to without adding new UI, which conflicts with "keep
 * the existing UI exactly as it is." This function is here so a future
 * edit-profile screen (a Phase 6+ UI decision, not a data-layer one) can
 * use it immediately rather than needing new plumbing.
 */
export async function updatePassengerProfile(
  supabase: SupabaseClient,
  passengerId: string,
  input: UpdatePassengerProfileInput
): Promise<void> {
  if (input.fullName !== undefined) {
    const { error } = await supabase.from("users").update({ full_name: input.fullName }).eq("id", passengerId);
    if (error) throw error;
  }
  if (input.defaultPaymentMethod !== undefined) {
    const { error } = await supabase
      .from("passengers")
      .update({ default_payment_method: input.defaultPaymentMethod })
      .eq("id", passengerId);
    if (error) throw error;
  }
}
