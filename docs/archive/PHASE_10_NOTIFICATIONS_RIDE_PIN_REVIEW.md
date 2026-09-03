# Ride It — Phase 10: Notifications, Ride Communication & Permanent Ride PIN Review

## 1. Notification architecture

Reused the existing `notifications` table (Phase 3) entirely — **no new
notifications table was created**. Its RLS was already exactly correct
for this phase's requirements: `notifications_select_own` (a user reads
only their own rows) and, critically, **no INSERT policy for
authenticated non-admin users at all** — meaning notifications have only
ever been creatable via `SECURITY DEFINER` context or an admin session,
since Phase 3. This already satisfied "do not trust recipient_id/ride_id/
type from an untrusted client" before this phase touched anything; Phase
10 built on top of that guarantee rather than needing to establish it.

A single internal helper, `_create_notification()` (granted to nobody,
callable only from within other `SECURITY DEFINER` functions — same
isolation pattern as Phase 6.2's `_mark_trusted_write()` and Phase 8's
`_get_matching_setting_int()`), avoids repeating the same `INSERT`
statement across every lifecycle function that needs to notify someone.

## 2. Ride PIN architecture

A permanent 4-digit PIN per passenger, replacing the per-ride SMS-OTP
concept entirely. Storage is **deliberately isolated** in a new
`passenger_ride_pins` table, not a column on `passengers` — see §4 for
why this isolation is the actual security-critical decision of this
phase, not an implementation detail.

## 3. PIN generation

`_generate_random_pin()` uses pgcrypto's `gen_random_bytes(4)` (OpenSSL's
CSPRNG, already installed since Phase 1) — **not** Postgres's built-in
`random()`, which is a fast PRNG and not cryptographically secure. Four
random bytes are cast to a 32-bit integer and reduced mod 10,000, then
zero-padded to 4 digits. A minor modulo bias from this reduction is
accepted as standard practice for a 4-digit keyspace (the brief itself
permits the full `0000`–`9999` range) — not worth rejection-sampling
complexity at this scale.

Generation happens in exactly two places, both server-side:
`handle_new_auth_user()` (extended again — this is now its fourth
amendment across Phases 4, 4.5, 6.1/6.2, and 10) generates the initial PIN
atomically at passenger account creation; `set_ride_pin()` regenerates on
explicit change. **The client never generates or supplies the PIN value**
during normal signup — it's entirely server-authoritative.

## 4. PIN hashing/storage — the central security decision of this phase

Hashed with pgcrypto's `crypt(pin, gen_salt('bf'))` (bcrypt) — a real,
already-available password-hashing mechanism, not invented for this
phase. Never reversible, never stored in plaintext.

**Why `passenger_ride_pins` is a separate table, not a column on
`passengers`**: `passengers` already has `passengers_select_active_ride_driver`
(Phase 3), which correctly lets a driver read the passenger's row for
their own active ride — needed for the Driver app's "who am I picking up"
display. If `pin_hash` lived on `passengers`, that same policy would also
hand the driver the hash. A 4-digit keyspace (10,000 values) is trivially
brute-forceable even from a bcrypt hash on ordinary hardware — so "it's
only a hash, not plaintext" would **not** actually satisfy the brief's
explicit "Driver cannot retrieve passenger PIN" requirement. The separate
table has exactly one RLS policy (`passenger_ride_pins_select_own`,
passenger reads their own row) and **deliberately no admin policy at
all** — there's no legitimate Admin use case for this table in this
phase, and the brief explicitly warns against Admin "casually" exposing
PINs.

## 5. PIN change flow

`set_ride_pin(p_new_pin)` — same function used for both initial generation
(called with no argument) and passenger-initiated change. "Appropriate
account authentication" is the existing Supabase session (`auth.uid()`),
the same bar every other authenticated mutation in this codebase uses
(profile edits, subscription purchase, etc. — none of them require a
separate step-up/re-auth flow, and this codebase has no such mechanism
anywhere to reuse). Documented as a considered decision, not an
oversight, in the migration's own comment.

**The plaintext is returned to the caller exactly once, at the moment of
generation/change, and never again.** This is a direct, unavoidable
consequence of never storing it — a one-way hash genuinely cannot be
"redisplayed" later. The UI handles this honestly (§14) rather than
pretending otherwise.

## 6. Driver verification flow

`verify_ride_pin_and_start(p_ride_id, p_entered_pin)` — the single atomic
gate, enforcing every check the brief listed in one function:

| Check | Enforcement |
|---|---|
| Caller is the assigned driver | `v_ride.driver_id IS DISTINCT FROM auth.uid()` → exception |
| Ride in appropriate pre-start state | `v_ride.status IS DISTINCT FROM 'driver_arriving'` → exception |
| Ride associated with correct passenger | PIN looked up via `v_ride.passenger_id`, never a client-supplied id |
| Ride PIN matches | `crypt(entered, stored_hash) = stored_hash` |
| Ride not cancelled/completed | Covered by the state check — `driver_arriving` is the only valid pre-start status |
| Driver actually assigned | Covered by the driver_id check |

**No attempt counter, no lockout** — an incorrect PIN returns `null`
(not an exception, not a recorded "attempt"); the ride simply doesn't
start. Exactly the brief's explicit product decision.

**A genuinely serious pre-existing vulnerability was found and fixed**:
`rides_update_driver` (Phase 3) is `USING (driver_id = auth.uid())` —
broad, row-level only RLS. The *old* `verifyRideOtp()`/`startRide()`
client functions were only ever a UI convention; nothing in the database
stopped an assigned driver from calling
`supabase.from('rides').update({status:'ride_started'})` directly,
bypassing OTP verification entirely. This was never caught in any prior
phase's review because it was never specifically probed or run against a
live database. Fixed with a new trigger, `protect_ride_start_transition`,
reusing Phase 6.2's `_mark_trusted_write()` mechanism as-is (it's
table-agnostic — built for `drivers`, works identically on `rides`)
rather than inventing a second "trusted write" concept.

## 7. Ride lifecycle changes

- `rides.otp` column **dropped** — no per-ride SMS OTP exists anymore.
- `rides.otp_verified_at` **renamed** to `pin_verified_at` (not
  drop-and-recreate) — its role (timestamp of successful start
  verification) is unchanged, only its meaning.
- The `otp_verified` status literal is no longer used by any transition —
  `verify_ride_pin_and_start()` goes directly from `driver_arriving` to
  `ride_started`. The underlying DB enum still technically contains the
  unused value (dropping an enum value is a materially more invasive
  operation than this phase's scope warrants); the TypeScript
  `RideStatusRow` union was updated to reflect what's actually reachable.
- `markDriverArriving()`, `completeRide()`, and post-acceptance
  cancellation were all converted from plain client-side `UPDATE`s into
  RPCs (`mark_driver_arriving`, `complete_ride`,
  `passenger_cancel_active_ride`) — **specifically so their accompanying
  notifications could be created server-side**, never trusted from an
  untrusted client, per the brief's explicit item 18. Each RPC does
  exactly what its predecessor did, plus one notification insert,
  atomically.

## 8. Notification types

No new `notification_type_enum` values were needed — the existing five
(`ride_status`, `offer`, `driver_arrival`, `payment_confirmation`,
`subscription`, `system`) already covered every event this phase needed:

| Event | Type used | Trigger point |
|---|---|---|
| Booking confirmed | `ride_status` | `AFTER INSERT` trigger on `rides` |
| Driver assigned | `ride_status` | `accept_ride_offer()` |
| Driver arriving/arrived | `driver_arrival` | `mark_driver_arriving()` |
| Ride started | — | *not sent* — the passenger already sees this live via Phase 8/9's realtime ride-status subscription; a duplicate push would be redundant, see §9 |
| Ride completed | `ride_status` | `complete_ride()` (both passenger and driver) |
| Ride cancelled | `ride_status` | `passenger_cancel_active_ride()` (driver), Admin's existing cancel path (unchanged, already admin-RLS-gated) |
| No drivers found | `ride_status` | `dispatch_next_batch()`'s exhaustion branch |
| New ride offer | `offer` | `dispatch_next_batch()`, per offered driver |
| Driver verification status changed | `system` | `AFTER UPDATE` trigger on `drivers` |

**Idempotency**: no separate idempotency key system was built — each
notification insert sits inside the same conditional branch as the
underlying state change that already guarantees at-most-once semantics
(a `ride_offers` row is only ever inserted once per driver per batch; a
ride's status only transitions once). Reusing that existing guarantee
rather than adding new complexity, per the brief's own suggestion.

## 9. Realtime vs. persistent notification responsibilities

Unchanged division of labor from Phase 8/9, restated because this phase
depended on it: **realtime subscriptions remain authoritative for live
ride/offer/location state** (Phase 8's `ride_offers`, Phase 9's
`get_ride_tracking`); **notifications are a durable communication
artifact alongside that**, not a replacement. This is why "ride started"
has no dedicated notification — the passenger's ride-status screen
already reflects it live via the existing realtime subscription, and a
push notification for a screen the passenger is already looking at would
be the "unnecessary notification for every tiny update" the brief warns
against.

## 10. Push architecture

`notification_devices` table — registration only (user_id, platform,
push_token, push_enabled), RLS-scoped to the owning user (`for all using
(user_id = auth.uid())`) plus admin. **This is architecture only.** No
FCM/APNs/Web Push credentials exist in this environment, nothing in this
phase obtains a real push token, and nothing sends an actual push
notification. `registerNotificationDevice()` in `@ride-it/data` is a
real, callable function, but calling it with a placeholder token
registers a row — it does not make push real.

## 11. SMS architecture

**Unchanged and untouched.** The existing phone-OTP account-verification
flow (`requestPhoneOtp`/`verifyPhoneOtp`, Phase 4) remains exactly as it
was — that's legitimate account authentication, explicitly distinct from
ride-start verification per the brief's own item 10. No SMS is sent for
any ride lifecycle event (driver assigned, arriving, started, completed)
— all of those are `notifications` rows only.

## 12. Database migrations

Six, in order:

1. `20260815090000_passenger_ride_pins.sql` — the isolated PIN table,
   `_generate_random_pin()`, `set_ride_pin()`, `get_ride_pin_status()`,
   `handle_new_auth_user()` extended.
2. `20260815090100_ride_pin_verification.sql` — drops `rides.otp`, renames
   `otp_verified_at`→`pin_verified_at`, `protect_ride_start_transition`
   trigger, `verify_ride_pin_and_start()`.
3. `20260815090200_ride_lifecycle_notifications.sql` — `_create_notification()`,
   `mark_driver_arriving()`, `complete_ride()`, `passenger_cancel_active_ride()`.
4. `20260815090300_matching_notifications.sql` — extends Phase 8's
   `dispatch_next_batch()`/`accept_ride_offer()` with notification creation
   (`CREATE OR REPLACE`, same signatures — amending, not duplicating).
5. `20260815090400_notification_triggers_and_devices.sql` — booking-confirmed
   trigger, driver-verification-status trigger, `notification_devices` table.
6. `20260815090500_notifications_realtime.sql` — adds `notifications` to the
   Realtime publication.

No existing table, column, RLS policy, or function was duplicated.

## 13. RLS/security changes

- **No existing RLS policy was weakened.** `rides_update_driver`,
  `passengers_select_active_ride_driver`, `notifications_select_own`, and
  every other policy from Phases 3–9 remain exactly as they were.
- **New**: `passenger_ride_pins`'s single narrow policy (§4).
  `notification_devices`'s self+admin policies.
- **New triggers**: `protect_ride_start_transition` (rides),
  `notify_ride_booked` (rides, `AFTER INSERT`),
  `notify_driver_verification_change` (drivers, `AFTER UPDATE`) — all
  `SECURITY DEFINER`, all deriving their recipient from the row itself
  (validated by existing insert-check constraints or the row's own
  identity), never from unvalidated client input.
- Every new `SECURITY DEFINER` function: `search_path` pinned (including
  `extensions` where pgcrypto functions are called — the lesson from
  Phase 8/9's `_find_eligible_drivers`/`get_ride_tracking` applied
  correctly from the start here), `EXECUTE` revoked from `PUBLIC`,
  granted only to `authenticated` (or to nobody, for internal-only
  helpers).
- Preserved, explicitly re-confirmed by reading them again this phase:
  Phase 6.1/6.2's `protect_driver_system_columns`, Phase 6.2's
  `provision_admin_user` (service-role only), Phase 8's location-privacy
  fix (`drivers_select_online` still dropped), Phase 9's `get_ride_tracking`
  authorization check.

## 14. Passenger changes

- **Signup/verify flow**: the one-time Ride PIN reveal, shown only for
  genuinely new accounts — detected by comparing the Supabase Auth
  account's own `created_at` to "now" (within 60 seconds), since
  `verifyOtp()`'s response has no explicit "this was a brand-new account"
  flag. Deliberately **not** passed via URL query parameter (a real,
  if minor, privacy concern for a secret value) — shown inline as a
  full-screen state within the same page.
- **Profile**: a Ride PIN card showing status ("last changed <date>") and
  a "Change Ride PIN" action that reveals the new plaintext once, with an
  explicit "we won't show it again" notice — the honest resolution to
  "Passenger should be able to see their Ride PIN" colliding with "never
  store it in plaintext" (see §5's fuller explanation).
- **`ride/[id]`**: the OTP `MeterValue` display is gone. Replaced with a
  contextual reminder ("Tell your driver your Ride PIN to start the
  ride") shown only once the driver has actually arrived — not the
  digits themselves, matching the brief's own example UI text in item 22
  exactly. Cancellation now calls `cancelActiveRide()` (the new RPC),
  correctly notifying the assigned driver.
- **Notifications screen**: unchanged in structure, now also subscribes
  to Realtime for live updates (new this phase) rather than only loading
  once.

## 15. Driver changes

- **Navigation screen**: OTP entry replaced with Ride PIN entry —
  `verify_ride_pin_and_start()` call, same "no attempt limit" UX (a wrong
  PIN just clears the input and lets the driver retry immediately, no
  counter shown because none exists).
- **New notifications screen** — this app had none before. Built via a
  link from Profile (matching the existing Documents/Subscription card
  pattern), not a new bottom-tab-bar icon — adding a 5th persistent tab
  would be a real layout change to a shared nav element; a Profile link
  is not.
- Dashboard, `RideRequestSheet`, Earnings, Wallet: **untouched**.

## 16. Admin changes

**None to the Admin app's UI this phase.** Admin already has no PIN
visibility (by design, §4) and nothing in this phase's brief required new
Admin screens. One deliberate scope decision, stated plainly: the brief's
example "driver verification requiring attention" and "support/dispute
activity" admin notifications were only partially built — the
driver-verification-status trigger (§8) covers the concrete,
already-existing trigger point (Phase 7's approval flow); a
"document submitted, needs review" admin notification and any
dispute-activity notification were **not** built, since no
passenger/driver-facing flow currently creates a `support_tickets` row to
trigger from, and adding one would be new scope beyond this phase's
brief. Named explicitly in §20.

## 17. Tests actually executed

| Check | Result |
|---|---|
| `pnpm install` | **Executed.** Clean. |
| `tsc --noEmit`, all 4 apps | **Executed for real.** Zero errors on the first pass across `passenger`, `driver`, `admin`, `marketing`. |
| `next dev` runtime boot | **Executed.** Real `200` from Passenger `/verify` (the new PIN-reveal logic), real `307` (correct auth-redirect) from Passenger `/profile`, Driver `/navigation` (the new PIN-entry screen), and Driver `/notifications` (the new screen). |
| Migration syntax / column / enum cross-checks | **Executed as static review** — every column and enum literal referenced in the six new migrations was checked against the actual `CREATE TABLE`/`CREATE TYPE` statements it depends on. |
| The actual Ride PIN verify→start database transaction, the notification triggers firing, Realtime delivery of a new notification | **Not executed** — no live Supabase project in this environment, same standing caveat as every phase since Phase 3. |
| SMS delivery | **Not tested — no SMS provider is configured in this environment, and none was touched this phase anyway** (existing OTP flow unchanged). |
| Push delivery | **Not tested — no push credentials exist.** Nothing in this phase claims otherwise. |

## 18. Test results

All static and runtime-boot checks passed. No bugs were found by this
phase's `tsc` pass that required fixing (unlike Phases 8/9, which each
found real bugs) — the main substantive finding this phase was the
**security gap in §6**, found by reading the existing RLS policy
carefully against the new requirement, not by a compiler.

## 19. External services still required

- A real Google Cloud/Firebase project with FCM (Android) and/or APNs
  (iOS) and/or Web Push (VAPID keys) credentials, plus actual device
  registration flows in the Passenger/Driver apps calling
  `registerNotificationDevice()` with real tokens obtained from those
  SDKs — none of this exists yet, only the receiving table.
- An SMS provider for the (unchanged, pre-existing) account-verification
  OTP flow — this was never configured in any prior phase either.
- A live Supabase project, as in every phase since Phase 3, to actually
  exercise any of §17's untested rows.

## 20. Known limitations

- **Admin notification coverage is partial** (§16) — driver verification
  changes are covered; document-submission and dispute-activity are not,
  since no real trigger point exists for the latter yet.
- **No presence/backgrounding-aware notification behavior** — this phase
  built the persistent-notification-center half of "foreground/background"
  correctly (notifications survive reconnect, are queryable on next load,
  and now arrive live via Realtime while the app is open), but actual
  background push delivery when the app is fully closed requires the
  external push infrastructure named in §19, which doesn't exist here.
- **The one-time PIN reveal's "new account" detection is a heuristic**
  (60-second window against the auth account's `created_at`), not a
  guaranteed signal — a sufficiently slow or interrupted signup flow could
  theoretically miss the window and skip the reveal, leaving the
  passenger with a real (unknown to them) PIN and only "Change PIN" as a
  recovery path. Judged acceptable given the alternative (showing the PIN
  reveal to every returning user on every login) is clearly worse UX, but
  named here as a real edge case, not swept away.

## 21. Deferred work

Matches this phase's explicit exclusions:

- No payment gateway work — nothing in this phase touches any fare or
  payment column.
- No Maps/location redesign — Phase 9's architecture is untouched;
  `RideMap`/`get_ride_tracking`/`watchDriverLocation` were not modified.
- No marketing notifications — the brief explicitly says not to add them
  yet; `notification_type_enum` was deliberately not extended for this.
- No enormous notification-preferences system — the existing (Phase 1,
  UI-only/unwired) Settings toggles were left exactly as they were,
  matching the brief's explicit "if not, do not build one."

## 22. Recommended Phase 11

Two reasonable directions:

1. **Real push notification delivery** — the receiving architecture
   (`notification_devices`, the notification-creation paths already
   wired into every relevant lifecycle transition) is complete; the
   remaining work is entirely external-service integration (FCM/APNs/Web
   Push credentials + an Edge Function or similar to actually send), not
   further schema or application-logic changes.
2. **Payment gateway integration** — explicitly deferred across every
   phase since Phase 5; every money-touching surface in this codebase is
   already structured to slot a real payment flow in without further
   architecture changes.

---

Phase 10 complete. Not starting Phase 11.
