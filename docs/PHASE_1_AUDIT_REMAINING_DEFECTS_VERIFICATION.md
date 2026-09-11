# Phase 1 audit — closing the last three live defects

Follow-up to the Phase 1 adversarial system audit (10 Sep 2026). That audit
left three defects live because the migrations fixing them could not be
applied at the time. This document records how each was closed and the
evidence that it is closed, against the live hosted project.

All SQL lives in
`supabase/migrations/20260910140000_phase1_audit_payment_matching_and_idor_fixes.sql`
(sections 3, 5 and 6, plus the Ride PIN clause added to section 2).

Status vocabulary: VERIFIED PASS / VERIFIED FAIL / BLOCKED / NOT TESTED.

---

## Migration state before this work

`supabase_migrations.schema_migrations` showed the earlier audit fixes applied
(payment capture lockdown, ride assignment guard, location heartbeat and GPS
guard, vehicle-matched subscription, re-match fix) but **not** the three below.
Section 5 was partially applied: `20260910133546_phase1_audit_05a_ride_pin_attempt_columns`
had added `rides.pin_attempt_count` and `rides.pin_locked_until`, while the
function that uses them had not been replaced. The columns were therefore
present, unused, and — as the baseline below shows — writable by clients.

---

## AUDIT-012 — Ride PIN brute force

**Before (VERIFIED FAIL).** As the ride's assigned driver, over the real RPC:

```
wrong-PIN attempt HTTP codes   [200,200,200,200,200,200,200,200,200] over 4675ms
pin_attempt_count              0
pin_locked_until               null
```

Nine wrong PINs accepted, nothing counted, nothing locked. Both the driver and
the passenger could additionally `PATCH /rest/v1/rides` to set
`pin_attempt_count` and `pin_locked_until` themselves (HTTP 200) — so the
columns added by `05a` would not have held even once the function used them.

**Fix.** Two parts, because either alone is insufficient:

1. `verify_ride_pin_and_start()` counts failures on the ride row and, at 5,
   sets `pin_locked_until = now() + interval '15 minutes'`. The lockout is
   checked *before* the hash comparison, so a locked-out driver cannot keep
   probing and a correct PIN is refused while the lockout stands. Success
   resets the counter and clears the lock. Every failure appends a
   `ride_pin_failed` event to `ride_events`.
2. `protect_ride_assignment_columns()` now refuses any direct client write to
   `pin_attempt_count` or `pin_locked_until`.

Counting lives inside the SECURITY DEFINER function and the state lives on the
ride row, so it cannot be evaded by a new session, a new browser, calling the
RPC directly, or changing request parameters.

**After (VERIFIED PASS).**

```
wrong-PIN attempt HTTP codes   [200,200,200,200,200,400] over 446ms
pin_attempt_count              5
pin_locked_until               set, 900s remaining
fresh login, same driver       http=400 (still locked)
driver PATCH of counter        http=403
passenger PATCH of counter     http=403
correct PIN while locked       refused
```

Lockout expiry was verified deterministically inside a rolled-back transaction
by moving `pin_locked_until` into the past (a test-only clock shift as
superuser — no production behaviour was changed to make this testable):

```
after 5 wrong attempts       pin_attempt_count=5, locked, 900s, 5 ride_pin_failed events
correct PIN while locked     refused: "Too many incorrect Ride PIN attempts. Try again in 900 seconds"
after lockout expires        started
final                        status=ride_started, pin_attempt_count=0, lock cleared, 1 ride_pin_verified event
```

---

## AUDIT-003 — duplicate concurrent booking

**Before (VERIFIED FAIL).** Genuinely simultaneous requests from one
authenticated passenger session:

```
2 simultaneous bookings   created=2/2   open rides after = 2
5 simultaneous bookings   created=5/5   open rides after = 5
sequential double-tap     open rides after = 2
```

**Fix.** A partial unique index, `rides_one_active_per_passenger`, on
`passenger_id` over the eight non-terminal statuses. Terminal statuses
(`ride_completed`, `payment`, `rated`, `cancelled`) are excluded so a passenger
with an unpaid finished ride can still book. This mirrors the "one active ride
per driver" rule `accept_ride_offer()` and `_find_eligible_drivers()` already
enforce. No pre-existing row violated it.

**After (VERIFIED PASS).**

```
2 simultaneous bookings   created=1/2   open rides after = 1
5 simultaneous bookings   created=1/5   open rides after = 1
sequential double-tap     second call rejected, open rides after = 1
re-book after terminal    second ride created
```

Losing requests fail with `23505 duplicate key value violates unique constraint
"rides_one_active_per_passenger"`, so no partial ride, dispatch or matching
state is created for them.

**Known consequence, worth tracking.** There is no cancel path for a ride at
`destination_reached` or `payment_collected` — `passenger_cancel_active_ride()`
covers only `accepted`, `driver_arriving` and `ride_started`. Before this index
a passenger stuck behind a driver who abandoned the ride at those statuses could
still book again; now they cannot until the driver completes it or an admin
intervenes (admins are exempt from the assignment guard and can update the
ride). This is a pre-existing gap in the lifecycle that the index makes
user-visible, not a regression introduced by it.

---

## AUDIT-007 — matching ownership

**Before (VERIFIED FAIL).**

```
passenger A -> passenger B's ride id   dispatch_next_batch http=200
driver      -> another passenger's ride  dispatch_next_batch http=200
```

`advance_ride_matching()` has scoped the ride to `passenger_id = auth.uid()`
since `20260907093000`, but `dispatch_next_batch()` was separately granted to
`authenticated` and checked nothing at all.

**Fix.** Remove the door rather than add a second lock:
`REVOKE EXECUTE ON FUNCTION public.dispatch_next_batch(uuid) FROM authenticated`.
Its ACL is now `postgres=X/postgres` only, so no client role can invoke it for
any ride — including the ride's own passenger — while
`advance_ride_matching()` still reaches it as its SECURITY DEFINER owner.

This is strictly stronger than an in-function ownership check, and leaves
exactly one authorized entry point into matching instead of two.

`startMatching()` in `packages/data/src/matching.ts` was the only client call
site; it now calls `advance_ride_matching()`. On a freshly created ride with no
live offer that dispatches a batch immediately, which is exactly the behaviour
`startMatching()` existed to trigger.

**After (VERIFIED PASS).**

```
passenger A -> passenger B's ride   http=403 permission denied for function dispatch_next_batch
driver      -> another ride         http=403 permission denied for function dispatch_next_batch
unauthenticated                     http=401
advance_ride_matching cross-user    http=500 Ride not found (scoped by passenger_id)
owner direct dispatch_next_batch    http=403 (closed to everyone)
owner heartbeat                     http=200 status=matched
```

Verified end to end through the real Passenger UI with the revoke in place:
booking confirmed, ride created, `batch_empty` recorded on the first attempt
(no fresh driver), then after a driver location ping the screen's own
three-second heartbeat produced `batch_dispatched`, one offer, and ride status
`matched` — with no client access to `dispatch_next_batch` at any point.

---

## Regression after all three

| Suite | Result |
| --- | --- |
| Security and payment-bypass regression (14 checks) | 14 pass |
| Full ride lifecycle: book, match, accept, PIN, start, destination, pay, complete, rate | pass |
| Payments: cash, history, online-path guards, refund authorization | 6 pass, 1 blocked |
| Matching Scenario A: several drivers, one ride | 4/4 rounds, exactly one winner |
| Matching Scenario B: one driver, two rides, simultaneous accept | 5/5 rounds, one ride held |
| Matching Scenario D: driver cancels, ride re-matched to another driver | pass |
| Chat: authorization, content, reassignment, terminal state | 10 pass |
| GPS plausibility guard | 4 pass |

BLOCKED: driver-UPI collection needs `drivers.upi_verified`, an admin-only
protected column, and no admin session was available. Unchanged by this work.

Passenger and Driver both type-check and build clean.
