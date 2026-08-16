/**
 * Phase 17 — Real Hosted Supabase Validation Script
 *
 * WHY THIS FILE EXISTS: this sandbox cannot reach *.supabase.co (network
 * egress allowlist, unchanged since Phase 14) and was never given a
 * Supabase access token or the database password (per your own explicit
 * instruction). Nothing in Phase 17 could be executed against the real
 * hosted project from here. This script is the concrete alternative:
 * real code, not fabricated output, that YOU run from the Windows
 * environment that actually has access — producing genuine PASS/FAIL
 * results against the real project, not a simulation.
 *
 * It mirrors the exact lifecycle Phase 16 validated locally (real
 * PostgREST, not hosted) — ride creation -> matching -> acceptance ->
 * Ride PIN -> completion -> the Phase 16 direct-payment fix -> rating —
 * plus the RLS security checks section C asks for, using the SAME
 * @supabase/supabase-js client and RPC/table call shapes the actual
 * Passenger/Driver/Admin apps use. Nothing here is a shortcut or a
 * weakened check; every assertion is the same one a real user session
 * would be subject to.
 *
 * USAGE:
 *   1. Set these env vars (same values already in your apps' .env.local):
 *        SUPABASE_URL=https://tzzmofsiefygpucwpbpi.supabase.co
 *        SUPABASE_ANON_KEY=<the real publishable/anon key>
 *      Do NOT set the service-role key here — this script deliberately
 *      never uses it, matching "do not weaken RLS to make testing
 *      easier."
 *   2. Create ONE real admin test account first (see "ADMIN SETUP"
 *      below) — this script cannot create it itself without
 *      service-role access, which it intentionally never uses.
 *   3. In the Supabase Dashboard: Authentication -> Sign In / Providers
 *      -> Phone -> Test OTP, register two test numbers (see "PHONE
 *      SETUP" below) — this is what lets this script exercise Passenger/
 *      Driver auth for real without Twilio.
 *   4. From the repo root (with @supabase/supabase-js already installed
 *      as a workspace dependency):
 *        node phase17-hosted-validation.mjs
 *   5. Read the printed PASS/FAIL/BLOCKED summary at the end. This
 *      script prints real HTTP-adjacent results (Supabase JS client
 *      error objects, real row data) — it does not print secrets.
 *
 * ADMIN SETUP (one-time, requires YOUR dashboard/service-role access,
 * which this script never uses):
 *     -- 1. Create the auth user via Dashboard > Authentication > Users > Add User
 *     --    (email + password, e.g. phase17-admin-test@example.com)
 *     -- 2. Promote it to admin (the ONLY real way — provision_admin_user
 *     --    is service_role-only by design, Phase 6.2), run in SQL Editor:
 *     select provision_admin_user(
 *       '<the new user''s UUID from step 1>',
 *       (select id from admin_roles limit 1),
 *       true
 *     );
 *   Then set ADMIN_TEST_EMAIL / ADMIN_TEST_PASSWORD env vars below to
 *   match.
 *
 * PHONE SETUP (one-time, Dashboard only):
 *   Authentication -> Providers -> Phone -> Test OTP -> add two numbers,
 *   e.g. +911111111111 / 111111 (passenger) and +912222222222 / 222222
 *   (driver). Set PASSENGER_TEST_PHONE / PASSENGER_TEST_OTP and
 *   DRIVER_TEST_PHONE / DRIVER_TEST_OTP below to match. If you skip this,
 *   the script marks every Passenger/Driver-auth-dependent test BLOCKED
 *   and still runs everything that doesn't need them (Admin auth, RLS
 *   isolation checks using existing/no session, etc.).
 *
 *   NOTE: for the ride-lifecycle section to reach PASS (not BLOCKED) at
 *   the matching step, your test driver also needs to be approved
 *   (verification_status='approved') and have an active subscription —
 *   both admin-only actions this script cannot perform itself. Do this
 *   once via the Admin app (logged in as your real test admin account)
 *   or the SQL Editor before running.
 *
 * SAFETY: this script never touches real customer data. It creates one
 * throwaway ride using coordinates in Vijayawada (matching the project's
 * seeded cities). It never calls supabase.auth.admin.* (that requires
 * service-role, deliberately never used here) and never issues raw SQL
 * — only the same REST/RPC calls the real apps make.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const ADMIN_TEST_EMAIL = process.env.ADMIN_TEST_EMAIL || null;
const ADMIN_TEST_PASSWORD = process.env.ADMIN_TEST_PASSWORD || null;

const PASSENGER_TEST_PHONE = process.env.PASSENGER_TEST_PHONE || null; // local 10 digits, e.g. "1111111111"
const PASSENGER_TEST_OTP = process.env.PASSENGER_TEST_OTP || null;
const DRIVER_TEST_PHONE = process.env.DRIVER_TEST_PHONE || null;
const DRIVER_TEST_OTP = process.env.DRIVER_TEST_OTP || null;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY environment variables. See the file header for setup.");
  process.exit(1);
}

const results = [];
function record(name, status, detail) {
  results.push({ name, status, detail });
  const tag = { PASS: "PASS", FAIL: "FAIL", BLOCKED: "BLOCKED", STATIC: "STATIC" }[status];
  console.log(`[${tag}] ${name}${detail ? " — " + detail : ""}`);
}

function freshClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
}

async function main() {
  console.log(`\nPhase 17 — real hosted Supabase validation against ${SUPABASE_URL}\n`);

  // A. Admin — real email/password auth
  let adminClient = null;
  if (ADMIN_TEST_EMAIL && ADMIN_TEST_PASSWORD) {
    adminClient = freshClient();
    const { data, error } = await adminClient.auth.signInWithPassword({ email: ADMIN_TEST_EMAIL, password: ADMIN_TEST_PASSWORD });
    if (error) {
      record("Auth: admin signInWithPassword (real GoTrue)", "FAIL", error.message);
      adminClient = null;
    } else {
      record("Auth: admin signInWithPassword (real GoTrue)", "PASS", `real session, user id ${data.user.id.slice(0, 8)}...`);
    }
  } else {
    record("Auth: admin signInWithPassword", "BLOCKED", "no ADMIN_TEST_EMAIL/ADMIN_TEST_PASSWORD set — see ADMIN SETUP in file header");
  }

  if (adminClient) {
    const { data, error } = await adminClient.from("admin_users").select("id").limit(1);
    if (error) record("PostgREST: admin session reads admin_users", "FAIL", error.message);
    else record("PostgREST: admin session reads admin_users", "PASS", `${data.length} row(s) — RLS evaluated under real identity`);
  } else {
    record("PostgREST: admin session reads admin_users", "BLOCKED", "no admin session");
  }

  // Anon baseline
  {
    const anon = freshClient();
    const { data, error } = await anon.from("rides").select("id").limit(1);
    if (error) record("RLS: anon cannot read rides", "PASS", error.message);
    else record("RLS: anon cannot read rides", data.length === 0 ? "PASS" : "FAIL", `${data.length} row(s) returned to anon`);
  }

  // A/D. Passenger + Driver real phone-OTP auth
  let passengerClient = null;
  let driverClient = null;
  let passengerId = null;
  let driverId = null;

  if (PASSENGER_TEST_PHONE && PASSENGER_TEST_OTP) {
    passengerClient = freshClient();
    const phone = `+91${PASSENGER_TEST_PHONE}`;
    const { error: sendErr } = await passengerClient.auth.signInWithOtp({ phone, options: { data: { role: "passenger" } } });
    if (sendErr) {
      record("Auth: passenger signInWithOtp (real GoTrue, Test OTP number)", "FAIL", sendErr.message);
      passengerClient = null;
    } else {
      const { data, error: verifyErr } = await passengerClient.auth.verifyOtp({ phone, token: PASSENGER_TEST_OTP, type: "sms" });
      if (verifyErr) {
        record("Auth: passenger verifyOtp", "FAIL", verifyErr.message);
        passengerClient = null;
      } else {
        passengerId = data.user.id;
        record("Auth: passenger real phone OTP sign-in", "PASS", `real session, user id ${passengerId.slice(0, 8)}...`);
      }
    }
  } else {
    record("Auth: passenger real phone OTP sign-in", "BLOCKED", "Twilio not configured and no Test OTP number set — see PHONE SETUP");
  }

  if (DRIVER_TEST_PHONE && DRIVER_TEST_OTP) {
    driverClient = freshClient();
    const phone = `+91${DRIVER_TEST_PHONE}`;
    const { error: sendErr } = await driverClient.auth.signInWithOtp({ phone, options: { data: { role: "driver", vehicle_type: "auto" } } });
    if (sendErr) {
      record("Auth: driver signInWithOtp (real GoTrue, Test OTP number)", "FAIL", sendErr.message);
      driverClient = null;
    } else {
      const { data, error: verifyErr } = await driverClient.auth.verifyOtp({ phone, token: DRIVER_TEST_OTP, type: "sms" });
      if (verifyErr) {
        record("Auth: driver verifyOtp", "FAIL", verifyErr.message);
        driverClient = null;
      } else {
        driverId = data.user.id;
        record("Auth: driver real phone OTP sign-in", "PASS", `real session, user id ${driverId.slice(0, 8)}...`);
      }
    }
  } else {
    record("Auth: driver real phone OTP sign-in", "BLOCKED", "Twilio not configured and no Test OTP number set — see PHONE SETUP");
  }

  if (passengerClient && passengerId) {
    const { data, error } = await passengerClient.from("passengers").select("id, rating").eq("id", passengerId).maybeSingle();
    if (error) record("Trigger: handle_new_auth_user provisioned passengers row", "FAIL", error.message);
    else record("Trigger: handle_new_auth_user provisioned passengers row", data ? "PASS" : "FAIL", data ? `rating=${data.rating}` : "no row found");
  }
  if (driverClient && driverId) {
    const { data, error } = await driverClient.from("drivers").select("id, verification_status").eq("id", driverId).maybeSingle();
    if (error) record("Trigger: handle_new_auth_user provisioned drivers row", "FAIL", error.message);
    else record("Trigger: handle_new_auth_user provisioned drivers row", data ? "PASS" : "FAIL", data ? `status=${data.verification_status}` : "no row found");
  }

  // C. RLS isolation checks
  if (passengerClient) {
    const { data, error } = await passengerClient.from("passenger_ride_pins").select("*").neq("passenger_id", passengerId);
    if (error) record("RLS: passenger cannot read another passenger's Ride PIN row", "PASS", error.message);
    else record("RLS: passenger cannot read another passenger's Ride PIN row", data.length === 0 ? "PASS" : "FAIL", `${data.length} row(s) returned`);
  }

  if (driverClient && driverId) {
    const { error } = await driverClient.from("drivers").update({ verification_status: "approved" }).eq("id", driverId);
    if (error) record("RLS: driver cannot self-approve (protect_driver_system_columns)", "PASS", error.message);
    else record("RLS: driver cannot self-approve", "FAIL", "update succeeded — should have been rejected");
  }

  // D/E. Full ride lifecycle
  let rideId = null;
  if (passengerClient && driverClient && passengerId && driverId) {
    const { data: ride, error: createErr } = await passengerClient
      .from("rides")
      .insert({
        passenger_id: passengerId,
        vehicle_type: "auto",
        status: "requested",
        pickup_location: "POINT(80.6480 16.5062)",
        pickup_address: "Phase 17 test pickup",
        drop_location: "POINT(80.6296 16.5193)",
        drop_address: "Phase 17 test drop",
        distance_km: 3.0,
        base_fare: 20,
        distance_fare: 30,
        total_fare: 50,
      })
      .select()
      .single();

    if (createErr) {
      record("Lifecycle: ride creation", "FAIL", createErr.message);
    } else {
      rideId = ride.id;
      record("Lifecycle: ride creation", "PASS", `ride ${rideId.slice(0, 8)}... created`);

      const { data: matchStatus, error: matchErr } = await passengerClient.rpc("advance_ride_matching", { p_ride_id: rideId });
      if (matchErr) record("Lifecycle: matching (advance_ride_matching)", "FAIL", matchErr.message);
      else record("Lifecycle: matching (advance_ride_matching)", "PASS", `ride status now "${matchStatus}"`);

      const { data: offers, error: offersErr } = await driverClient.from("ride_offers").select("status").eq("ride_id", rideId);
      if (offersErr) record("Lifecycle: driver sees offer row", "FAIL", offersErr.message);
      else
        record(
          "Lifecycle: driver sees offer row",
          offers.length > 0 ? "PASS" : "BLOCKED",
          offers.length > 0 ? `${offers.length} offer(s)` : "no offer — driver likely not approved/online/subscribed, see PHONE SETUP note"
        );

      if (offers && offers.length > 0) {
        const { error: acceptErr } = await driverClient.rpc("accept_ride_offer", { p_ride_id: rideId });
        if (acceptErr) record("Lifecycle: driver accepts", "FAIL", acceptErr.message);
        else record("Lifecycle: driver accepts", "PASS");

        const { data: pinResult, error: pinErr } = await passengerClient.rpc("set_ride_pin", { p_new_pin: "4827" });
        if (pinErr) record("Lifecycle: passenger sets known Ride PIN", "FAIL", pinErr.message);
        else record("Lifecycle: passenger sets known Ride PIN", "PASS", `pin=${pinResult}`);

        const { error: arrivingErr } = await driverClient.rpc("mark_driver_arriving", { p_ride_id: rideId });
        if (arrivingErr) record("Lifecycle: driver marks arriving", "FAIL", arrivingErr.message);
        else record("Lifecycle: driver marks arriving", "PASS");

        const { data: wrongPin } = await driverClient.rpc("verify_ride_pin_and_start", { p_ride_id: rideId, p_entered_pin: "0000" });
        record("Lifecycle: wrong Ride PIN does not start ride", wrongPin === null ? "PASS" : "FAIL", wrongPin === null ? "correctly returned null" : "ride started with wrong PIN!");

        const { data: rightPin, error: startErr } = await driverClient.rpc("verify_ride_pin_and_start", { p_ride_id: rideId, p_entered_pin: "4827" });
        if (startErr || !rightPin) record("Lifecycle: correct Ride PIN starts ride", "FAIL", startErr?.message ?? "null result");
        else record("Lifecycle: correct Ride PIN starts ride", "PASS", `status now "${rightPin.status}"`);

        const { error: completeErr } = await driverClient.rpc("complete_ride", { p_ride_id: rideId });
        if (completeErr) record("Lifecycle: ride completion", "FAIL", completeErr.message);
        else record("Lifecycle: ride completion", "PASS");

        const { data: preConfirm } = await passengerClient.from("rides").select("payment_status").eq("id", rideId).single();
        const { data: confirmed, error: confirmErr } = await passengerClient.rpc("confirm_direct_payment", { p_ride_id: rideId, p_method: "cash" });
        if (confirmErr) {
          record("E. Phase 16 fix: confirm_direct_payment (cash)", "FAIL", confirmErr.message);
        } else {
          record(
            "E. Phase 16 fix: confirm_direct_payment (cash)",
            confirmed.payment_status === "paid" ? "PASS" : "FAIL",
            `before="${preConfirm?.payment_status}" after="${confirmed.payment_status}"`
          );
        }

        {
          const { error: rejErr } = await driverClient.rpc("confirm_direct_payment", { p_ride_id: rideId, p_method: "cash" });
          record("E. Security: non-owning caller rejected by confirm_direct_payment", rejErr ? "PASS" : "FAIL", rejErr?.message ?? "should have been rejected");
        }

        {
          const { error: directErr } = await passengerClient.from("rides").update({ payment_status: "refunded" }).eq("id", rideId);
          record("E. Security: direct payment_status manipulation still blocked", directErr ? "PASS" : "FAIL", directErr?.message ?? "update succeeded — should have been rejected");
        }

        const { data: rating, error: ratingErr } = await passengerClient.rpc("submit_rating", { p_ride_id: rideId, p_rating: 5, p_comment: "Phase 17 real hosted test" });
        if (ratingErr) record("Lifecycle: rating submission", "FAIL", ratingErr.message);
        else record("Lifecycle: rating submission", "PASS", `rating id ${rating.id.slice(0, 8)}...`);
      }
    }
  } else {
    record("Lifecycle: full ride flow", "BLOCKED", "requires both real passenger and driver sessions — see PHONE SETUP");
  }

  // F. Realtime
  if (passengerClient && rideId) {
    const realtimeResult = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve("timeout"), 8000);
      passengerClient
        .channel(`phase17-test:${rideId}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${rideId}` }, () => {
          clearTimeout(timeout);
          resolve("received");
        })
        .subscribe();
      setTimeout(async () => {
        await passengerClient.rpc("mark_driver_arriving", { p_ride_id: rideId }).catch(() => {});
      }, 1500);
    });
    record(
      "F. Realtime: subscription receives a real hosted change event",
      realtimeResult === "received" ? "PASS" : "FAIL",
      realtimeResult === "received" ? "event received within 8s" : "no event received — check publication membership / connection"
    );
    await passengerClient.removeAllChannels();
  } else {
    record("F. Realtime", "BLOCKED", "requires an active ride from the lifecycle section above");
  }

  if (passengerClient) await passengerClient.auth.signOut().catch(() => {});
  if (driverClient) await driverClient.auth.signOut().catch(() => {});
  if (adminClient) await adminClient.auth.signOut().catch(() => {});

  console.log("\n=== SUMMARY ===");
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, STATIC: 0 };
  for (const r of results) counts[r.status]++;
  console.log(`PASS: ${counts.PASS}  FAIL: ${counts.FAIL}  BLOCKED: ${counts.BLOCKED}  STATIC: ${counts.STATIC}`);
  if (counts.FAIL > 0) {
    console.log("\nFAILED CHECKS:");
    results.filter((r) => r.status === "FAIL").forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("Script error (not a test result):", e);
  process.exit(2);
});
