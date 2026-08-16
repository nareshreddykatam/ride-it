import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@ride-it/supabase/server";
import { isE2ETestModeEnabled, ensureE2ETestAuthUser, getE2ESignInCredentials } from "@ride-it/supabase/e2e";

/**
 * Development-only. See PHASE_20_E2E_VALIDATION_REPORT.md and
 * packages/supabase/src/e2e.ts for the full safety model.
 *
 * This route:
 *   1. Refuses to run unless E2E test mode is enabled (redundant check
 *      — ensureE2ETestAuthUser/getE2ESignInCredentials also refuse
 *      internally; this early return additionally avoids even
 *      attempting the bootstrap and returns 404 rather than 403, so a
 *      production deployment with the flag correctly unset looks
 *      exactly like this route doesn't exist).
 *   2. Bootstraps the dedicated E2E passenger account via the real
 *      Supabase Admin API (server-only — the service-role key never
 *      leaves this function).
 *   3. Signs in with the REAL, request-scoped Supabase server client
 *      (anon key, not service-role) using signInWithPassword — a
 *      genuine Supabase Auth session, with cookies set by the same SSR
 *      mechanism the real OTP flow's session ultimately relies on via
 *      middleware.
 *   4. Never returns the password, the service-role key, or any other
 *      secret in the response body.
 */
export async function POST() {
  if (!isE2ETestModeEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await ensureE2ETestAuthUser("passenger");
    const { email, password } = getE2ESignInCredentials("passenger");

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "E2E login failed" }, { status: 500 });
  }
}
