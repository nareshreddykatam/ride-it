import type { SupabaseClient } from "@supabase/supabase-js";

export type EmailAuthRole = "passenger" | "driver";

export interface RequestEmailOtpOptions {
  /** Only meaningful for role: "driver" — see handle_new_auth_user() migration comment on why it defaults server-side if omitted. */
  vehicleType?: "bike" | "auto";
  fullName?: string;
}

/**
 * Sends a one-time code to the given email address. Mirrors
 * requestPhoneOtp() (phone-otp.ts) exactly in shape and intent — same
 * `role`/`vehicleType`/`fullName` metadata contract, read back out by the
 * same handle_new_auth_user() trigger, so a single onboarding path serves
 * both identifiers.
 *
 * NOTE (environment configuration, not code): by default, Supabase's
 * built-in "Magic Link" email template sends a clickable link, not a
 * 6-digit code — for the Verify screen's `verifyOtp({ type: "email" })`
 * call below to actually have a code to check, the project's Auth > Email
 * Templates > Magic Link template must include `{{ .Token }}`. This is a
 * Supabase Dashboard change, not something this file can do.
 */
export async function requestEmailOtp(
  supabase: SupabaseClient,
  email: string,
  role: EmailAuthRole,
  options: RequestEmailOtpOptions = {}
): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
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

/** Verifies the emailed 6-digit code and completes sign-in. Throws on invalid/expired code. */
export async function verifyEmailOtp(supabase: SupabaseClient, email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error) throw error;
  return data;
}
