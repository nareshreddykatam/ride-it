import type { SupabaseClient } from "@supabase/supabase-js";
import type { PassengerProfileRow } from "./types";

const PROFILE_COLUMNS =
  "id, rating, total_rides, default_payment_method, users:id(full_name, phone, email, date_of_birth, gender)";

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
    users:
      | {
          full_name: string | null;
          phone: string | null;
          email: string | null;
          date_of_birth: string | null;
          gender: PassengerProfileRow["gender"];
        }
      | Array<{
          full_name: string | null;
          phone: string | null;
          email: string | null;
          date_of_birth: string | null;
          gender: PassengerProfileRow["gender"];
        }>;
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
    date_of_birth: userRow?.date_of_birth ?? null,
    gender: userRow?.gender ?? null,
  };
}

/**
 * True once every field Part 2 requires for onboarding is present. Used
 * both to decide whether to route a just-verified user into /onboarding
 * and as a defensive re-check on Home in case an older/partial account
 * ever lands there directly.
 */
export function isPassengerProfileComplete(profile: Pick<PassengerProfileRow, "full_name" | "phone" | "email" | "date_of_birth" | "gender">): boolean {
  return Boolean(
    profile.full_name?.trim() && profile.phone?.trim() && profile.email?.trim() && profile.date_of_birth && profile.gender
  );
}

export interface UpdatePassengerProfileInput {
  fullName?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  gender?: PassengerProfileRow["gender"];
  defaultPaymentMethod?: PassengerProfileRow["default_payment_method"];
}

export async function updatePassengerProfile(
  supabase: SupabaseClient,
  passengerId: string,
  input: UpdatePassengerProfileInput
): Promise<void> {
  const userUpdates: Record<string, unknown> = {};
  if (input.fullName !== undefined) userUpdates.full_name = input.fullName;
  if (input.phone !== undefined) userUpdates.phone = input.phone;
  if (input.email !== undefined) userUpdates.email = input.email;
  if (input.dateOfBirth !== undefined) userUpdates.date_of_birth = input.dateOfBirth;
  if (input.gender !== undefined) userUpdates.gender = input.gender;

  if (Object.keys(userUpdates).length > 0) {
    const { error } = await supabase.from("users").update(userUpdates).eq("id", passengerId);
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
