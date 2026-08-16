import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "./server";

/**
 * Development-only E2E auth bootstrap (Phase 20).
 *
 * WHY THIS EXISTS: Ride It's production authentication is phone OTP
 * (packages/auth/src/phone-otp.ts, unchanged by this file). The real
 * hosted Supabase project has no funded SMS provider, which has blocked
 * every real hosted end-to-end test since Phase 17. This module does
 * NOT replace or weaken phone OTP — it provisions a small number of
 * dedicated, clearly-marked throwaway test accounts using Supabase's
 * own officially-documented Admin API
 * (`supabase.auth.admin.createUser`), then signs them in with
 * `signInWithPassword` — a real, standard Supabase Auth method for a
 * phone-confirmed user. The resulting session is a genuine GoTrue
 * session, indistinguishable from a real login as far as PostgREST,
 * RLS, RPCs, and Realtime are concerned — which is the entire point:
 * it lets the REST of the real hosted lifecycle finally be tested for
 * real, without paying for SMS.
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
 *     (e2e_provision_driver_readiness, migration 20260820090300) checks
 *     this exact marker server-side, in the database itself, before
 *     touching anything -- so this bootstrap structurally cannot be
 *     pointed at a real user's account, even by mistake.
 *   - No RLS policy, trigger, or SECURITY DEFINER function was weakened
 *     to make this work. Passenger readiness needs no special
 *     provisioning at all -- handle_new_auth_user() (unmodified)
 *     already gives any new passenger everything rides_insert_passenger
 *     requires. Driver readiness uses the new, narrowly-scoped RPC
 *     rather than a direct table write specifically because a direct
 *     write would (correctly) be rejected by protect_driver_system_columns
 *     -- that protection is not bypassed, it's respected, via a
 *     different, more precisely-scoped legitimate path.
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

function e2eCredentials(role: E2ERole): { phone: string; password: string } {
  return role === "passenger"
    ? { phone: requireEnv("RIDE_IT_E2E_PASSENGER_PHONE"), password: requireEnv("RIDE_IT_E2E_PASSENGER_PASSWORD") }
    : { phone: requireEnv("RIDE_IT_E2E_DRIVER_PHONE"), password: requireEnv("RIDE_IT_E2E_DRIVER_PASSWORD") };
}

function normalizePhone(phone: string): string {
  return phone.replace(/^\+/, "");
}

async function findExistingE2EUser(admin: SupabaseClient, phone: string) {
  const target = normalizePhone(phone);
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.phone && normalizePhone(u.phone) === target);
    if (found) return found;
    if (data.users.length < 200) return null;
    page++;
  }
}

/**
 * Idempotently ensures the dedicated E2E auth user for `role` exists,
 * via the real Supabase Admin API -- never a fabricated session. Returns
 * its id and phone; never returns or logs the password.
 * user_metadata mirrors exactly what a real phone-OTP signup carries
 * (role, vehicle_type for drivers) plus the permanent e2e_test_user/
 * e2e_role markers, so the existing, unmodified handle_new_auth_user()
 * trigger provisions the matching passengers/drivers row through its
 * normal path -- this function never writes to those tables itself.
 */
export async function ensureE2ETestAuthUser(role: E2ERole): Promise<{ userId: string; phone: string }> {
  requireE2ETestMode();
  const { phone, password } = e2eCredentials(role);
  const admin = getSupabaseAdminClient();

  const existing = await findExistingE2EUser(admin, phone);
  if (existing) {
    return { userId: existing.id, phone };
  }

  const { data, error } = await admin.auth.admin.createUser({
    phone,
    password,
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
  return { userId: data.user.id, phone };
}

/**
 * Idempotently provisions the minimum legitimate fixtures required for
 * the E2E driver to become eligible under the existing, unmodified
 * matching rules (_find_eligible_drivers): approval + an active
 * subscription. Deliberately does NOT set is_online, current_location,
 * or vehicle_type directly -- those remain the driver app's own real
 * online-toggle flow (packages/data/src/drivers.ts,
 * setDriverOnlineStatus), so that flow is genuinely exercised by a real
 * E2E test session, not bypassed.
 */
export async function ensureE2EDriverReadiness(driverId: string): Promise<void> {
  requireE2ETestMode();
  const admin = getSupabaseAdminClient() as unknown as SupabaseClient;
  const { error } = await admin.rpc("e2e_provision_driver_readiness", { p_driver_id: driverId });
  if (error) throw error;
}

/**
 * The credentials needed for the actual sign-in step. Deliberately
 * separate from ensureE2ETestAuthUser so callers can bootstrap the
 * account (service-role, server-only) and sign in (anon-key session
 * client, also server-only in this project's Route Handlers) as two
 * explicit steps -- the sign-in step never touches the service-role key.
 */
export function getE2ESignInCredentials(role: E2ERole): { phone: string; password: string } {
  requireE2ETestMode();
  return e2eCredentials(role);
}
