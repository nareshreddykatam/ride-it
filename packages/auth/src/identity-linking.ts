import type { SupabaseClient } from "@supabase/supabase-js";
import { toE164 } from "./phone-otp";

/**
 * Adds a second, verified identifier (phone or email) to the CURRENTLY
 * AUTHENTICATED account, using Supabase Auth's own official mechanism —
 * auth.updateUser() followed by auth.verifyOtp({ type: "phone_change" |
 * "email_change" }) — rather than a new, separate auth system or a
 * fabricated "does this exist" check.
 *
 * This is deliberately NOT the same as requestPhoneOtp()/requestEmailOtp()
 * (phone-otp.ts / email-otp.ts), which start a SIGN-IN (or first-time
 * signup) for a given identifier. Calling those while already signed in
 * would either sign the caller into a *different* existing account (if
 * the identifier already belongs to one) or silently create a brand new
 * one — exactly the duplicate-account risk this flow exists to avoid.
 * updateUser() instead modifies the SAME auth.users row currently signed
 * in, and Supabase itself rejects the change server-side if the
 * identifier is already claimed by a different account (auth.users.email/
 * phone are both globally unique — see migration history), so this can
 * never silently take over or merge with someone else's account.
 *
 * Once verified, GoTrue updates auth.users.phone/email on this same row;
 * migration 20260903090000's trigger mirrors that into public.users so
 * the profile stays in sync automatically — no separate write needed
 * here.
 */
export async function requestLinkPhone(supabase: SupabaseClient, localPhone: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ phone: toE164(localPhone) });
  if (error) throw error;
}

/** Verifies the OTP sent by requestLinkPhone() and completes the link. */
export async function confirmLinkPhone(supabase: SupabaseClient, localPhone: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ phone: toE164(localPhone), token, type: "phone_change" });
  if (error) throw error;
}

/** Same mechanism as requestLinkPhone(), for adding a verified email instead. */
export async function requestLinkEmail(supabase: SupabaseClient, email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() });
  if (error) throw error;
}

/** Verifies the OTP sent by requestLinkEmail() and completes the link. */
export async function confirmLinkEmail(supabase: SupabaseClient, email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: "email_change" });
  if (error) throw error;
}
