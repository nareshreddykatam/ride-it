import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@ride-it/supabase/server";
import { isE2ETestModeEnabled, ensureE2ETestAuthUser, ensureE2EDriverReadiness, getE2ESignInCredentials } from "@ride-it/supabase/e2e";

/**
 * Development-only. See PHASE_20_E2E_VALIDATION_REPORT.md and
 * packages/supabase/src/e2e.ts for the full safety model.
 *
 * Identical shape to the Passenger route, plus one extra step:
 * ensureE2EDriverReadiness approves the driver and grants an active
 * subscription (via the narrowly-scoped, service_role-only
 * e2e_provision_driver_readiness RPC, migration 20260820090300) so the
 * driver can legitimately reach the "online" toggle. Going online
 * itself remains the driver app's own real flow — not performed here.
 */
export async function POST() {
  if (!isE2ETestModeEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { userId } = await ensureE2ETestAuthUser("driver");
    await ensureE2EDriverReadiness(userId);
    const { phone, password } = getE2ESignInCredentials("driver");

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ phone, password });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "E2E login failed" }, { status: 500 });
  }
}
