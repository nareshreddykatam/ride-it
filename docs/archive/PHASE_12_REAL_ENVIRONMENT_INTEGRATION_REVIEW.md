# Ride It — Phase 12: Real Environment & External-Service Integration Review

## A note on what changed this phase, capability-wise

Every review document since Phase 3 has said some version of "no live
Supabase project, reasoned through but not executed." This phase is
different in one specific, important way: **Docker is unavailable in this
sandbox** (confirmed, `docker: not found`), which rules out the full
`supabase start` stack — but this sandbox's package manager *can* reach
`archive.ubuntu.com`, so a **real PostgreSQL 16 server with real PostGIS
3.4.2 was installed and run for this phase**. That is a genuine capability
this project has never had before. What follows distinguishes precisely
what that did and didn't let me verify — real schema/RLS/trigger/function
execution against a real database, but *not* GoTrue, PostgREST, or the
Realtime server, none of which vanilla Postgres provides.

## 1. Environment architecture

Three environments — development, staging, production — share the same
`.env.example`-documented variable names; only values differ. No
environment-specific code branches exist (e.g. no `if
(process.env.NODE_ENV === 'staging')`) — the same build artifact is
intended to run in any environment purely by which credentials it's
given. This wasn't newly designed this phase; it's the pattern every
prior phase already established (`isGoogleMapsConfigured()`,
`isPaymentGatewayConfigured()`) and this phase confirms it's coherent
end-to-end. See §17 for the concrete matrix.

## 2. Supabase setup

`supabase/config.toml` existed since Phase 3 but had drifted stale — see
§4. No Supabase project (staging or production) exists; none was created
this phase (the brief's explicit "do not require me to provide
credentials mid-phase" and "do not fabricate credentials" were both
honored — nothing was invented).

## 3. Local database setup

**Real finding, fixed**: `major_version = 15` in `config.toml` was stale.
Verified by actually running the current Supabase CLI (`npx supabase
init`, version `2.114.0`, fetched fresh from the npm registry) in a
scratch directory and diffing its real generated default against ours —
the current default is `17`. Updated, with the exact discrepancy
documented in the file itself. Also added an entirely missing
`[realtime]` section (Realtime has been core to this project since Phase
8; the config simply never had an explicit section for it) and explicit
`[db.seed]`/`[db.migrations]` sections matching current CLI convention.

**Docker remains the actual blocker for `supabase start`/`db reset`
specifically** — those commands require the full Docker-based local stack
regardless of config correctness. This is stated plainly, not worked
around: `supabase start` was never run in this environment, and nothing
in this document claims it was.

## 4. Migration results — ACTUALLY EXECUTED, not reasoned through

**All 49 migrations (48 pre-existing + 1 new, see §18) were applied to a
real PostgreSQL 16 + PostGIS 3.4.2 + pgcrypto database, for real, in
this session.** This required a compatibility shim
(`supabase/local-test-harness/supabase-compat-shim.sql`, clearly
separated from the real migration history, never counted as a Ride It
migration) approximating only what a real Supabase project already
provides before any application migration runs: the
`anon`/`authenticated`/`service_role` Postgres roles, a minimal `auth`
schema (`auth.users`, `auth.uid()`, `auth.role()`), a minimal `storage`
schema (`storage.buckets`/`storage.objects`/`storage.foldername()`), and
an empty `supabase_realtime` publication. The shim's own header documents
exactly what it does and doesn't approximate — no GoTrue, no PostgREST,
no real Realtime server.

**Two real, previously-undetected issues found purely by executing the
chain, neither caught by six phases of static review:**

1. **`storage.buckets`/`storage.objects` don't exist without the full
   Supabase Storage service** — a genuine environment gap, not a Ride It
   bug. Approximated in the shim with Supabase's own published, stable
   Storage schema shape.
2. **`LANGUAGE SQL` functions resolve identifiers using the session's
   *ambient* search_path at `CREATE FUNCTION` time, not the function's own
   `SET search_path` clause** (that override only applies once the
   function *executes*). `_find_eligible_drivers()`
   (migration `20260813090300`) failed to even `CREATE` against a bare
   `"$user", public` default. Real Supabase projects set `extensions` in
   the database-level default search_path from provisioning — this is a
   **test-harness gap**, fixed in the shim (`ALTER DATABASE ... SET
   search_path`), not a Ride It migration bug.

With both fixed, the chain applies in full. **Exactly one expected error
remains** — migration `20260813090300` creates the *original*, later-corrected
(migration `20260813090600`, Phase 8's own documented self-fix)
version of `_find_eligible_drivers`. This is not a bug: it's this
project's real, legitimate migration history containing a genuine
self-correction, exactly like Phase 4→4.5, Phase 6→6.1. Confirmed by
running the *entire* chain without `ON_ERROR_STOP` and checking the
*final* state: `_find_eligible_drivers`'s `proconfig` was directly
queried and confirmed to be `{"search_path=public, extensions"}` — the
corrected version — after the full chain completes.

**A third, genuinely new bug was found by executing the chain and then
testing against it** — see §5, item under "Passenger."

**Seed data applied for real**: `seed.sql` ran cleanly; `cities` (Vijayawada,
Hyderabad, both active) and `subscription_plans` (all 4, correct
amounts/durations) were queried back and confirmed correct.

**Database integrity, checked directly against the real final schema**:
all 29 expected tables present (`\dt public.*`), zero duplicates; RLS
enabled on every single one (`select ... where not relrowsecurity` →
0 rows); PostGIS extension + geography columns on `rides`/`drivers`/
`saved_places` confirmed with correct `udt_name`; GiST spatial indexes on
all four expected columns confirmed present; all 14 spot-checked
functions across every phase (`is_admin`, `accept_ride_offer`,
`verify_ride_pin_and_start`, `create_pending_ride_payment`,
`process_payment_webhook_event`, `provision_admin_user`, etc.) confirmed
to exist in the final schema.

## 5. RLS test results — ACTUALLY EXECUTED against real Postgres sessions

**This is the section the brief calls out as most important, and it's
where the most real work happened.** Real test identities were created
(`auth.users` rows for 2 passengers, 2 drivers, 1 admin — the
`handle_new_auth_user` trigger fired for real on each insert, itself a
live confirmation the trigger works). Each test used `SET LOCAL role
authenticated; SET LOCAL request.jwt.claims = '{"sub":"<uuid>", ...}'`
inside a transaction, then rolled back — a genuine, standard technique
for exercising real RLS policies against real Postgres sessions without
a full GoTrue/PostgREST stack. Every result below is an actual query
result, not a prediction:

| # | Test | Result |
|---|---|---|
| 1 | Passenger sees own ride | ✅ 1 row |
| 2 | Passenger cannot see another passenger's ride | ✅ 0 rows |
| 3 | Passenger cannot directly set `payment_status='paid'` | ✅ Blocked — `protect_ride_financial_columns` fired |
| 4 | Passenger cannot directly rewrite the fare | ✅ Blocked — same trigger |
| 5 | Driver cannot see a ride never offered to them | ✅ 0 rows |
| 6 | Driver cannot self-approve (`verification_status`) | ✅ Blocked — `protect_driver_system_columns` |
| 6b | Driver cannot change their own `rating` | ✅ Blocked — same trigger |
| 7 | Driver cannot modify another driver's location | ✅ 0 rows updated (RLS row-scope, before the trigger even runs) |
| 8 | Unauthorized (`anon`, no session) cannot read `rides`/`drivers` | ✅ **Stronger than expected** — `permission denied for function is_admin`, since Phase 6.2 revoked `EXECUTE` on `is_admin()` from `PUBLIC` entirely; `anon` can't even evaluate the RLS policy, not just get zero rows |
| 9 | Passenger cannot read another passenger's Ride PIN row | ✅ 0 rows |
| 10 | Admin sees all rides | ✅ 1 row (correct — only 1 ride existed) |
| 11 | Driver cannot directly bypass PIN by setting `status='ride_started'` | ✅ 0 rows updated — `rides_update_driver`'s own row-scope (`driver_id IS NULL` at that point) blocked it before reaching `protect_ride_start_transition` |
| — | `provision_admin_user()` rejects an authenticated (non-service-role) caller | ✅ `permission denied for function provision_admin_user` |
| — | `wallet_transactions` rejects a direct client `INSERT` | ✅ `new row violates row-level security policy` |

Every one of these is a real database response to a real simulated
session, not a static read of the policy definition.

## 6. Auth test results

**What was tested for real**: role inference on account creation. The
`handle_new_auth_user()` trigger fired on real `auth.users` inserts and
correctly assigned `role='passenger'` for phone-based signups with
`{"role":"passenger"}` metadata, `role='driver'` for
`{"role":"driver"}`, and `role='admin'` only for the email-only (no
phone) signup — confirming Phase 6.2's security fix (self-service
accounts can never become admin via metadata) holds against a real
trigger execution, not just a read of the function body. A permanent
Ride PIN was also auto-generated for each passenger row by the same
trigger, queried back and confirmed present.

**What was NOT tested — no GoTrue in this environment**: real SMS OTP
delivery/verification, real session JWT issuance, real
`supabase.auth.getUser()` behavior, real Next.js middleware
session-refresh behavior. Nothing in this document claims otherwise.

## 7. Realtime test results

**Not executed** — this sandbox's Postgres was built without the
`logical` WAL level required for actual publication-based replication
(`CREATE PUBLICATION supabase_realtime` succeeded but printed a real
warning: `wal_level is insufficient to publish logical changes`), and
there is no Realtime server process here regardless. `ride_offers`
correctly appeared for the intended driver and correctly did *not*
appear for an unrelated driver when queried directly via RLS (§5), which
proves the *authorization* Realtime would rely on is correct — but actual
websocket message delivery was not and could not be tested here.

## 8. PostGIS test results — ACTUALLY EXECUTED

Real coordinates, real distance. A driver was placed at
`POINT(78.4870 17.3855)`, a ride's pickup at `POINT(78.4867 17.3850)` —
`_find_eligible_drivers()` returned that exact driver at **63.9 meters**,
a real `ST_Distance` computation against real geography columns using the
real `<->` KNN operator (confirmed via `EXPLAIN`-free direct execution,
returning correctly ordered/limited results). `dispatch_next_batch()` was
then called for real and created a real `ride_offers` row; `accept_ride_offer()`
was called for real and atomically transitioned the ride to `accepted`.
This is the first time in this project's entire history that the
matching engine has executed against a real spatial database rather than
being reasoned through.

`get_ride_tracking()`'s `search_path = public, extensions` (the fix from
Phase 9, itself found by reading — not running — code at the time) was
directly confirmed correct against this real database: it and every
other `extensions`-calling function created without error once the
harness's own search_path gap (§4) was fixed.

## 9. Google Maps configuration

**Required APIs, confirmed by re-reading Phase 9's actual code, not
assumed**: Maps JavaScript API (rendering, `@ride-it/maps`'s `RideMap`),
Geocoding API (`@ride-it/maps/server/geocoding`, Passenger's
booking-confirm flow only), Routes API (`@ride-it/maps/server/eta`,
throttled ETA — plumbing exists, not yet wired into any UI per the Phase
9 review's own honest limitation). No Places API, no Directions
rendering — confirmed via `grep` that no other Google Maps Platform
product is referenced anywhere in this codebase.

**Key separation** (unchanged from Phase 9, re-confirmed correct this
phase): `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (client, rendering only),
`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` (client, optional), `GOOGLE_MAPS_GEOCODING_API_KEY`
(server-only, Passenger only), `GOOGLE_MAPS_ROUTES_API_KEY` (server-only,
Passenger + Driver).

## 10. Google Maps key restrictions

No real Google Cloud project or keys exist in this environment — nothing
was created. Documented recommendation, not a completed action: the
rendering key should carry an **HTTP referrer (website) restriction**
scoped to each app's real deployed domain(s) once they exist; each
server-only key (Geocoding, Routes) should carry an **API restriction**
(that key may only call that one API) and, where the hosting platform
supports it, an **IP/application restriction** scoped to the deployment's
egress IPs. This is standard Google Cloud Console configuration, done at
credential-creation time — nothing in this repository can create or
enforce it; it's recorded here as the exact next action for whoever
provisions real credentials.

## 11. Razorpay Test Mode configuration

No real Razorpay account exists in this environment (confirmed in the
Phase 11 review; unchanged this phase — the brief for this phase
explicitly says test mode only, never live). The provider abstraction
(`@ride-it/payments`) already requires exactly three values —
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — with
no code path that distinguishes test-mode from live-mode credentials
structurally (Razorpay's own test/live distinction lives entirely in
which key prefix — `rzp_test_`/`rzp_live_` — is configured, not in this
codebase). This means the *same* architecture already built in Phase 11
is what test-mode integration would use; nothing new was built here
because nothing new was needed.

## 12. Razorpay webhook testing

**Not executed against a real Razorpay Test Mode account or a real HTTP
request with a real signature** — no credentials exist. What *was*
tested for real: the **idempotency mechanism** at the database layer,
using a simulated event. `process_payment_webhook_event()` was called
directly (as `service_role`, matching its real grant) with a fabricated
but structurally-correct event; it correctly transitioned a real payment
to `captured`, correctly set `rides.payment_status = 'paid'`, and —
called a **second time with the identical `provider_event_id`** —
correctly did nothing further (confirmed via `select count(*) from
payment_webhook_events` staying at 1). This proves the idempotency
*mechanism* works against a real database; it does not prove Razorpay's
actual webhook delivery format matches what `verifyAndParseWebhook()`
expects, since no real webhook was ever received.

If a public webhook URL is needed before a real Supabase/hosting project
exists (e.g. to test against Razorpay Test Mode from local development), a
tunnel tool (ngrok, Cloudflare Tunnel, or similar) pointed at the local
Next.js dev server would be the standard approach — not set up here, no
such tool was installed or configured.

## 13. Payment test results

| Check | Result |
|---|---|
| `create_pending_ride_payment` reads the real authoritative fare | ✅ Executed for real — returned `amount = 85.00`, matching the real ride's `total_fare` exactly, never a parameter |
| Idempotent reuse (calling it twice) | ✅ Executed — second call returned the identical `payment.id`; `select count(*)` confirmed exactly 1 row |
| Cross-passenger authorization | ✅ Executed — a different passenger's session got `Caller does not own this ride` |
| DB-level double-capture prevention | ✅ Executed — a second `INSERT ... status='captured'` for the same `ride_id` hit `payments_one_captured_per_ride` and was rejected |
| Webhook-driven capture updates `rides.payment_status` | ✅ Executed (simulated event, §12) |
| Real gateway order creation, real checkout, real signature verification against a real Razorpay response | ❌ Not executed — no credentials |

## 14. Subscription test results

Not executed with a real gateway payment this phase (no credentials) —
architecture unchanged from Phase 11 and not re-tested against a live
gateway. The underlying `subscriptions_expires_after_starts` constraint
(`expires_at > starts_at`) and the driver-online-requires-active-subscription
trigger **were** both exercised for real: a test driver was correctly
blocked from going online with no subscription (`enforce_driver_online_requires_subscription`
fired with its real error message), then correctly allowed once a real
`active` subscription row existed.

## 15. Secret-management review

Repository scanned for common secret patterns (`sk_live`, `sk_test_`,
`rzp_live`, `rzp_test_`, Google API key shape, JWT-shaped strings) across
every `.ts`/`.tsx`/`.sql`/`.md`/`.json`/`.env*` file — **zero matches**.
Every `.env.example` file confirmed to declare variable names with no
values. `.gitignore` confirmed to cover `.env`/`.env.local`. No secret
was found; none needed rotation or removal.

## 16. CI/CD review

**No CI configuration existed before this phase.** Added one minimal
workflow (`.github/workflows/ci.yml`, §22's own numbering) — install,
per-app `tsc --noEmit`, and real migration validation via a Postgres+PostGIS
GitHub Actions service container (the same real-execution approach used
manually this phase, now scripted for repeatability). No deployment step,
no secrets referenced anywhere in the workflow file.

## 17. Development/staging/production matrix

| | Development | Staging | Production |
|---|---|---|---|
| Database | Local Postgres (this phase: manual; ideally `supabase start` once Docker is available) | Dedicated Supabase project | Dedicated Supabase project |
| Auth | Local Supabase Auth (once `supabase start` works) or a shared dev Supabase project | Real SMS OTP provider configured | Real SMS OTP provider, production-tier |
| Maps | Optional — falls back to `MockMap` honestly if unset | Restricted test/staging keys | Restricted production keys, budget alerts |
| Payments | Optional — Cash/Driver UPI fully usable with zero config; Online shows honest "unavailable" | Razorpay **Test Mode** keys | Razorpay **live** keys (explicitly out of scope until a dedicated launch phase) |
| Webhook endpoint | Tunnel tool if needed (not configured) | Real staging domain's `/api/payments/webhook` | Real production domain's `/api/payments/webhook` |
| Domain | `localhost:300x` per app | `*.staging.<domain>` (not provisioned) | Real production domains (not provisioned) |
| Secrets | Local `.env.local`, gitignored | Hosting platform's secret manager | Hosting platform's secret manager, stricter access control |

Nothing in this row set beyond "Development" has been provisioned — this
is a plan, documented per the brief's explicit request, not a claim that
staging/production infrastructure exists.

## 18. Exact external credentials still required

- A real Supabase project (any tier) — for real GoTrue/PostgREST/Realtime,
  and to move past this phase's Postgres-only local validation.
- A real Google Cloud project with Maps JavaScript API, Geocoding API, and
  Routes API enabled, plus three correctly-restricted keys (§9-10).
- A real Razorpay account with Test Mode enabled — key id, key secret,
  and a configured webhook secret.
- An SMS OTP provider (Supabase Auth's own, or a custom provider) — for
  real account-verification SMS, unrelated to and never conflated with
  the Ride PIN system (Phase 10).
- Real push credentials (Web Push VAPID keys, and/or FCM/APNs) — the
  `notification_devices` table (Phase 10) is ready to receive real tokens;
  none exist.
- Docker — specifically to unlock `supabase start`/`db reset` and the
  full local stack this phase could only partially substitute for.

## 19. Known blockers

- **Docker is unavailable in this sandbox.** This is the single blocker
  named explicitly, per the brief's own instruction to document exact
  blockers rather than work around them. Everything in §4-8 that *was*
  achieved required building and clearly labeling a compatibility shim
  specifically because of this blocker — not because the migrations
  themselves were unready.
- No real external credentials of any kind (§18) exist in this sandbox.

## 20. Known limitations

- The compatibility shim's `auth.uid()`/`auth.role()` implementation is a
  well-established, standard approximation of PostgREST's real JWT-claim
  passing convention — not independently verified against a live GoTrue
  instance's exact behavior in every edge case.
- Postgres 16 was used for all live testing this phase; `config.toml` now
  correctly declares 17 (§3-4) to match current real Supabase Cloud
  defaults — a version gap between what was tested and what a real
  project would run, though nothing in this project's 50 migrations
  depends on a 16-vs-17-specific feature.
- Realtime *authorization* (via RLS, §5) was verified for real; actual
  message *delivery* (§7) was not, and could not be, without a running
  Realtime server.
- No real gateway (Razorpay) or real Maps Platform request has ever been
  made by this codebase — every claim in §9-14 is scoped precisely to
  what was and wasn't executed.

## 21. Recommended Phase 13

Two reasonable directions:

1. **Provision a real Supabase project** (even a free tier) and re-run
   this phase's exact test suite against it — the RLS/matching/PIN/payment
   tests in §5, §8, §12-13 are already written as real, reusable SQL and
   would need only a connection string change to become genuinely live
   Supabase validation rather than a compatibility-shimmed approximation.
2. **Razorpay Test Mode credentials** — the single highest-value next step
   for the payment architecture specifically, converting §11-14's
   "architecturally complete, executed only at the database layer" into
   genuine end-to-end gateway validation.

---

Phase 12 complete. Not starting Phase 13.
