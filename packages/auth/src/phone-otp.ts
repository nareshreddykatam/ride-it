import type { SupabaseClient } from "@supabase/supabase-js";

export type PhoneAuthRole = "passenger" | "driver";

/**
 * India-only assumption matches the existing UI ("+91" is already
 * hardcoded in Login screens). Exported so the unified identifier
 * detector (./identifier.ts) can normalize a raw 10-digit input the same
 * way this file always has — one normalization implementation, not two.
 */
export function toE164(localTenDigitPhone: string): string {
  return `+91${localTenDigitPhone}`;
}

export interface RequestPhoneOtpOptions {
  /** Only meaningful for role: "driver" — see handle_new_auth_user() migration comment on why it defaults server-side if omitted. */
  vehicleType?: "bike" | "auto";
  fullName?: string;
}

/**
 * Sends an OTP to the given 10-digit local phone number. The `role` (and,
 * for drivers, `vehicleType`) is passed as auth user_metadata — the
 * `handle_new_auth_user()` database trigger reads it back out on first
 * sign-in to provision the matching public.users/passengers/drivers row.
 */
export async function requestPhoneOtp(
  supabase: SupabaseClient,
  localPhone: string,
  role: PhoneAuthRole,
  options: RequestPhoneOtpOptions = {}
): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    phone: toE164(localPhone),
    options: {
      data: {
        role,
        ...(role === "driver" ? { vehicle_type: options.vehicleType ?? "auto" } : {}),
        ...(options.fullName ? { full_name: options.fullName } : {}),
      },
    },
  });
  if (error) throw error;
}

/** Verifies the 6-digit code and completes sign-in. Throws on invalid/expired code. */
export async function verifyPhoneOtp(supabase: SupabaseClient, localPhone: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    phone: toE164(localPhone),
    token,
    type: "sms",
  });
  if (error) throw error;
  return data;
}
