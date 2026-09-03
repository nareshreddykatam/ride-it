import type { SupabaseClient } from "@supabase/supabase-js";
import type { PassengerProfileRow } from "./types";

// users!passengers_id_fkey (not the bare `users:id`) — passengers.id is
// both this table's PK and its FK to users(id), but passengers is ALSO
// the target of several other one-to-many FKs (rides.passenger_id,
// saved_places.passenger_id, recent_locations.passenger_id, etc.).
// PostgREST's embed hint resolution doesn't narrow to "the FK where id is
// the local column" from a bare `id` hint alone — confirmed live against
// the hosted project: PGRST201 "more than one relationship was found for
// 'passengers' and 'id'", with passengers_id_fkey listed as one of eight
// ambiguous candidates. The explicit constraint-name hint is required.
// Same root cause and fix already applied in drivers.ts and admin.ts's
// ADMIN_RIDE_COLUMNS.
const PROFILE_COLUMNS =
  "id, rating, total_rides, default_payment_method, users!passengers_id_fkey(full_name, phone, email, date_of_birth, gender)";

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

/**
 * Creates this identity's public.passengers (+ passenger_ride_pins) row if
 * it doesn't already exist — the missing piece for a same-email cross-role
 * user (an existing driver who is now becoming a passenger too): see
 * drivers.ts's ensureDriverProfile() for the full explanation; this is its
 * passenger-side mirror. Safe/idempotent to call every time passenger
 * onboarding starts.
 */
export async function ensurePassengerProfile(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("ensure_passenger_profile");
  if (error) throw error;
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
    if (error) {
      // 23505 = unique_violation. users_phone_unique_idx is the one a
      // passenger can realistically hit here — e.g. they already have a
      // second, separate Ridora account (created earlier via the other
      // identifier, before that account was ever linked to this one) that
      // already claims this phone number. The raw Postgres message
      // ("duplicate key value violates unique constraint ...") is
      // meaningless to a passenger and unhelpful even to a developer
      // reading it in the UI — surfaced as a clear, actionable message
      // instead. Every other error (RLS denial, connectivity, etc.) is
      // rethrown as-is; nothing else is guessed at or hidden.
      if (error.code === "23505" && error.message.includes("users_phone_unique_idx")) {
        throw new Error(
          "That mobile number is already linked to a different Ridora account. Use a different number, or sign in with that number instead."
        );
      }
      throw error;
    }
  }
  if (input.defaultPaymentMethod !== undefined) {
    const { error } = await supabase
      .from("passengers")
      .update({ default_payment_method: input.defaultPaymentMethod })
      .eq("id", passengerId);
    if (error) throw error;
  }
}
