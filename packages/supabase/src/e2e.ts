import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "./server";

/**
 * Development-only E2E auth bootstrap (Phase 20; revised in a later
 * change to sign in via email/password instead of phone/password).
 *
 * WHY THIS EXISTS: Ride It's production authentication is phone OTP
 * (packages/auth/src/phone-otp.ts, unchanged by this file). The real
 * hosted Supabase project has no funded SMS provider, which has blocked
 * every real hosted end-to-end test since Phase 17. This module does
 * NOT replace or weaken phone OTP — it provisions a small number of
 * dedicated, clearly-marked throwaway test accounts using Supabase's
 * own officially-documented Admin API
 * (`supabase.auth.admin.createUser`), then signs them in. The resulting
 * session is a genuine GoTrue session, indistinguishable from a real
 * login as far as PostgREST, RLS, RPCs, and Realtime are concerned —
 * which is the entire point: it lets the REST of the real hosted
 * lifecycle finally be tested for real, without paying for SMS.
 *
 * WHY EMAIL/PASSWORD, NOT PHONE/PASSWORD, FOR SIGN-IN: signing in with
 * `signInWithPassword({ phone, password })` still requires Supabase's
 * Phone provider to be enabled on the hosted project — and enabling
 * that provider at all requires configuring an SMS provider (Twilio,
 * Vonage, MessageBird, TextLocal), even though no SMS is ever actually
 * sent for a password-based sign-in. `signInWithPassword({ email,
 * password })` has no such dependency. This is the actual, concrete
 * reason for using email here — not a style preference.
 *
 * WHY A PHONE VALUE IS STILL SET ON THE E2E USER, EVEN THOUGH IT IS NOT
 * USED FOR SIGN-IN: handle_new_auth_user() (unmodified by this file)
 * infers the provisioned role as: a non-null phone → passenger/driver
 * (from user_metadata); only when phone is null and email is present
 * does it fall through to `v_role := 'admin'`. An E2E user created with
 * only an email would therefore be misclassified as an admin by that
 * existing logic — a real, previously-identified risk in this exact
 * trigger, not something invented for this change. Rather than modify
 * that security-sensitive trigger to accommodate E2E testing, this
 * bootstrap continues to set a deterministic test phone value so E2E
 * users take the same safe, existing phone-based branch a real signup
 * would — the risky email-only branch is never reached, by
 * construction, not by assumption. No database change was needed or
 * made for this reason.
 *
 * SAFETY MODEL:
 *   - Every function here refuses to run unless RIDE_IT_E2E_TEST_MODE
 *     is exactly "true" AND NODE_ENV is not "production" -- both
 *     checked together, redundantly, on every call.
 *   - This file is never imported from any Client Component. It uses
 *     getSupabaseAdminClient() (packages/supabase/src/server.ts),
 *     which itself throws if ever evaluated in a browser context.
 *   - Every created test user is permanently marked
 *     `{ e2e_test_user: true, e2e_role: "passenger" | "driver" }` in
 *     its own auth metadata. Driver-readiness provisioning
 *     (e2e_provision_driver_readiness, migration 20260820090300,
 *     unchanged by this revision) checks this exact marker
 *     server-side, in the database itself, before touching anything --
 *     so this bootstrap structurally cannot be pointed at a real user's
 *     account, even by mistake.
 *   - No RLS policy, trigger, or SECURITY DEFINER function was modified
 *     to make this work. Email/phone/password are all sourced from
 *     server-only environment variables, never client input -- there is
 *     no way for a browser request to choose or influence what account
 *     gets created or signed into.
 */

export type E2ERole = "passenger" | "driver";


/** Both checks are required, redundantly, on every call site. */
export function isE2ETestModeEnabled(): boolean {
  return process.env.RIDE_IT_E2E_TEST_MODE === "true" && process.env.NODE_ENV !== "production";
}

function requireE2ETestMode(): void {
  if (!isE2ETestModeEnabled()) {
    throw new Error(
      "[@ride-it/supabase/e2e] E2E test mode is not enabled. Set RIDE_IT_E2E_TEST_MODE=true in a non-production environment to use this -- it is refused unconditionally otherwise."
    );
  }
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[@ride-it/supabase/e2e] Missing E2E environment variable "${key}".`);
  }
  return value;
}

/**
 * Email + password: what the real Supabase Auth sign-in now actually
 * uses (see the file's header comment for why this replaced phone).
 * Phone is still required and still set on the created auth user, but
 * is NOT used for sign-in any more -- it exists solely so
 * handle_new_auth_user() (unmodified by this file) takes its existing,
 * safe passenger/driver branch instead of falling through to the
 * email-only admin-inference branch. See the header comment for the
 * full reasoning; this is not a leftover, it is load-bearing.
 */
function e2eCredentials(role: E2ERole): { email: string; phone: string; password: string } {
  return role === "passenger"
    ? {
        email: requireEnv("RIDE_IT_E2E_PASSENGER_EMAIL"),
        phone: requireEnv("RIDE_IT_E2E_PASSENGER_PHONE"),
        password: requireEnv("RIDE_IT_E2E_PASSENGER_PASSWORD"),
      }
    : {
        email: requireEnv("RIDE_IT_E2E_DRIVER_EMAIL"),
        phone: requireEnv("RIDE_IT_E2E_DRIVER_PHONE"),
        password: requireEnv("RIDE_IT_E2E_DRIVER_PASSWORD"),
      };
}

/**
 * Idempotency now keys off email, since email is the identifier the
 * sign-in step actually uses. Phone is still set on the user (see
 * e2eCredentials) but is no longer what this lookup matches on.
 */
async function findExistingE2EUser(admin: SupabaseClient, email: string) {
  const target = email.toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email && u.email.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
    page++;
  }
}

/**
 * Idempotently ensures the dedicated E2E auth user for `role` exists,
 * via the real Supabase Admin API -- never a fabricated session. Returns
 * its id; never returns or logs the password. Both email_confirm and
 * phone_confirm are set true -- email because signInWithPassword needs
 * a confirmed identity to authenticate against, phone for the same
 * reason handle_new_auth_user() needs a non-null phone at all (see the
 * file header). user_metadata mirrors exactly what a real phone-OTP
 * signup carries (role, vehicle_type for drivers) plus the permanent
 * e2e_test_user/e2e_role markers, so the existing, unmodified
 * handle_new_auth_user() trigger provisions the matching
 * passengers/drivers row through its normal path -- this function never
 * writes to those tables itself.
 */
export async function ensureE2ETestAuthUser(role: E2ERole): Promise<{ userId: string }> {
  requireE2ETestMode();
  const { email, phone, password } = e2eCredentials(role);
  const admin = getSupabaseAdminClient();

  const existing = await findExistingE2EUser(admin, email);
  if (existing) {
    return { userId: existing.id };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    phone,
    password,
    email_confirm: true,
    phone_confirm: true,
    user_metadata: {
      role,
      e2e_test_user: true,
      e2e_role: role,
      ...(role === "driver" ? { vehicle_type: "auto" } : {}),
    },
  });
  if (error || !data.user) {
    throw error ?? new Error("[@ride-it/supabase/e2e] Failed to create E2E test user.");
  }
  return { userId: data.user.id };
}

/**
 * Idempotently provisions the minimum legitimate fixtures required for
 * the E2E driver to become eligible under the existing, unmodified
 * matching rules (_find_eligible_drivers): approval + an active
 * subscription. Deliberately does NOT set is_online, current_location,
 * or vehicle_type directly -- those remain the driver app's own real
 * online-toggle flow (packages/data/src/drivers.ts,
 * setDriverOnlineStatus), so that flow is genuinely exercised by a real
 * E2E test session, not bypassed. Unchanged by this revision -- it keys
 * off the driver's id and the e2e_test_user metadata marker, never
 * phone, so switching sign-in to email required no change here.
 */
export async function ensureE2EDriverReadiness(driverId: string): Promise<void> {
  requireE2ETestMode();
  const admin = getSupabaseAdminClient() as unknown as SupabaseClient;
  const { error } = await admin.rpc("e2e_provision_driver_readiness", { p_driver_id: driverId });
  if (error) throw error;
}

/**
 * The credentials needed for the actual sign-in step: email + password.
 * Deliberately separate from ensureE2ETestAuthUser so callers can
 * bootstrap the account (service-role, server-only) and sign in
 * (anon-key session client, also server-only in this project's Route
 * Handlers) as two explicit steps -- the sign-in step never touches the
 * service-role key.
 */
export function getE2ESignInCredentials(role: E2ERole): { email: string; password: string } {
  requireE2ETestMode();
  const { email, password } = e2eCredentials(role);
  return { email, password };
}
