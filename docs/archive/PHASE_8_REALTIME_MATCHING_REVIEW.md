# Ride It — Phase 8: Realtime Driver Matching Review

## 1. Architecture

Pull-based matching, not a background scheduler. There is no Supabase Edge
Function or `pg_cron` job configured (no live project available to set one
up in this environment), so progression is driven by a lightweight,
idempotent **heartbeat** — `advance_ride_matching(ride_id)` — that the
Passenger app's Matching screen calls every 3 seconds while searching.
Each call expires stale offers (using the database's own `now()`, never
client time) and dispatches the next batch if no offer is currently live.
Realtime (`postgres_changes`) is layered on top so a *successful* match is
reflected the instant it happens, without waiting for the next heartbeat
tick — the heartbeat drives progress, Realtime delivers the result
immediately.

This is a deliberate, environment-appropriate design, stated plainly
rather than dressed up as a real scheduler: a production deployment with
Edge Functions available could replace the client-driven heartbeat with a
server-side cron calling the same `advance_ride_matching` function with no
other changes needed — the RPC itself doesn't care who calls it.

## 2. Matching algorithm

1. Passenger creates a ride (`createRide`, unchanged from Phase 5) →
   immediately calls `startMatching()` → `dispatch_next_batch()`.
2. `dispatch_next_batch` finds up to `matching_batch_size` (default 3)
   nearest eligible drivers via `_find_eligible_drivers`, creates a
   `ride_offers` row for each (a denormalized snapshot of the ride's
   display fields — see §4), and sets `rides.status = 'matched'`.
3. Each offered driver's app receives the new row via a targeted Realtime
   subscription (`driver_id = eq.<their id>`) and shows it with a
   server-authoritative countdown.
4. If a driver **accepts**: `accept_ride_offer` atomically wins the race
   (§8), marks every other pending offer for that ride `superseded`, and
   the ride transitions to `accepted`.
5. If a driver **rejects** or their offer **expires** (checked by the next
   heartbeat, against real time): once no live offer remains for the
   current batch, the next heartbeat call to `dispatch_next_batch` tries
   the next batch of eligible drivers — excluding everyone already offered
   this ride in any prior batch.
6. This repeats until acceptance, `matching_max_batches` (default 5) is
   exhausted, or the passenger cancels. Exhaustion sets `rides.status =
   'cancelled'` with `cancelled_by = 'system'` and
   `cancellation_reason = 'no_drivers_available'` — reusing the existing
   enum values rather than adding a new ride status.

## 3. Driver eligibility rules

All enforced in `_find_eligible_drivers`'s `WHERE`/`JOIN ON` clause, one
predicate per requirement:

| Requirement | Predicate |
|---|---|
| Online | `d.is_online = true` |
| Verified/approved | `d.verification_status = 'approved'` |
| Correct vehicle type | `d.vehicle_type = r.vehicle_type` |
| Fresh location | `d.location_updated_at > now() - <freshness threshold>` |
| Not busy | `NOT EXISTS` another non-terminal ride assigned to them |
| Not already offered this ride | `NOT EXISTS` a `ride_offers` row for (this ride, this driver) in any batch |
| Not mid-offer elsewhere | `NOT EXISTS` another pending, unexpired offer for a *different* ride — a driver is never offered two rides at once |
| Correct city | `r.city_id IS NULL OR d.current_city_id = r.city_id` |

No duplicate driver-state concept was introduced — every predicate reuses
Phase 3 columns (`is_online`, `verification_status`, `current_city_id`,
`current_location`, `location_updated_at`) or the existing `rides`/
`ride_offers` rows. "Active/not suspended" is covered by
`verification_status = 'approved'` (the same enum Phase 7's Admin approval
flow already writes to — `suspended` is a real enum value that simply
never matches this predicate).

## 4. Location strategy

- **Real spatial query, not application-side distance calculation.**
  `_find_eligible_drivers` uses the `<->` KNN operator (not `ST_Distance`
  in `ORDER BY`), which lets Postgres use `drivers_online_location_idx`
  (Phase 3's partial GiST index on `current_location WHERE is_online AND
  verification_status='approved'`) for index-accelerated nearest-neighbor
  retrieval. Drivers are never loaded into application memory for distance
  computation.
- **Freshness threshold is centralized**, not a magic number:
  `app_settings.driver_location_freshness_seconds` (default 120s), read
  via a small SQL helper (`_get_matching_setting_int`) rather than
  hardcoded in the query.
- **`location_updated_at` is genuinely server-authoritative** — a new
  trigger (migration `20260813090500`) sets it to `now()` only when
  `current_location` actually changes, and a client can no longer send it
  at all (the update payload was changed to send only `current_location`).
  Before this fix, the client sent its own wall-clock timestamp alongside
  the coordinates — which would have made the freshness check only as
  trustworthy as whatever the client claimed. Found and fixed during this
  phase, not left as a gap.
- **Reporting**: the Driver Dashboard uses the browser's Geolocation API
  (a device capability, not a maps service — no Google Maps integration
  here) when available, pinging every 20 seconds while online, falling
  back to a fixed demo coordinate when geolocation is denied/unavailable —
  the same honest-boundary pattern used everywhere else location has come
  up in this project.

## 5. Realtime channels/subscriptions

| Subscriber | Channel | Filter | Purpose |
|---|---|---|---|
| Passenger | `ride:<rideId>` | `rides`, `id=eq.<rideId>` | React to their own ride's status changing |
| Driver | `driver-offers:<driverId>` | `ride_offers` INSERT, `driver_id=eq.<driverId>` | Receive new offers made to them |
| Admin | `admin-rides` | `rides`, unfiltered | Live Rides list refresh (matches `rides_all_admin`'s already-broad RLS — not a new grant) |

Nothing subscribes broadly except Admin, whose RLS already permits full
visibility. RLS is not bypassed by Realtime — Supabase evaluates each
subscriber's `SELECT` policy per change event, so a passenger's `ride:`
subscription can only ever deliver rows `rides_select_passenger` already
lets them read, same for drivers' `ride_offers` subscription and
`ride_offers_select_own_driver`.

**Reconciliation on reconnect**: the Driver Dashboard calls
`getActiveOfferForDriver()` on mount (a plain authoritative query, not
relying on the realtime stream having been continuously connected) — if a
realtime event was missed while the screen wasn't open, this catches an
already-pending offer rather than silently missing it.

## 6. Database changes

Seven new migrations (`20260813090000` through `20260813090600`):

1. **`ride_offers`** — the core new table (see §7 for why it exists).
2. **Matching config in `app_settings`** — `matching_offer_window_seconds`
   (15, matching the Driver app's existing countdown UI exactly),
   `matching_batch_size` (3), `driver_location_freshness_seconds` (120),
   `matching_max_batches` (5).
3. **Location privacy fix** — dropped `drivers_select_online` (see §7).
4. **The matching engine** — `_get_matching_setting_int`,
   `_find_eligible_drivers`, `dispatch_next_batch`,
   `advance_ride_matching`, `accept_ride_offer` (supersedes and drops
   Phase 6.1's `accept_ride_request`), `reject_ride_offer`,
   `passenger_cancel_matching_ride`.
5. **Realtime publication** — `rides` and `ride_offers` added to
   `supabase_realtime` (only these two — not a blanket "replicate
   everything").
6. **Server-authoritative location timestamp trigger.**
7. **`search_path` fix for `_find_eligible_drivers`** — found during a
   careful re-read, not by running it (no live Postgres available):
   PostGIS lives in the `extensions` schema, and this was the first
   function to call PostGIS *functions* (`ST_Distance`, `<->`) rather than
   just using the `geography` *type* — its `search_path` was originally
   `public` only and would have failed to resolve those calls against a
   real database. Fixed via a follow-up `CREATE OR REPLACE`, same pattern
   as every prior phase's fixes (Phase 4.5, 6.1, 6.2, 7) — a new migration
   correcting a previous one, not a silent edit.

No existing table, column, or function was duplicated. `city_id`,
`pickup_location`, `current_location`, etc. all already existed from Phase
3 and are reused as-is.

## 7. RLS/security changes

Two pre-existing findings, not introduced this phase, fixed as part of it:

- **`drivers_select_online` (Phase 3) dropped.** It permitted *any*
  authenticated user to read every online driver's exact
  `current_location`, unconditionally — precisely the "broad
  location-read policy" this phase's brief prohibits. Confirmed unused by
  any application code before removing it (grepped the whole repo).
  Post-assignment visibility is unaffected
  (`drivers_select_active_ride_passenger`, unchanged, already correctly
  scoped a passenger to only their own assigned ride's driver).
- **`rides_select_driver` (`driver_id = auth.uid()`) was never changed —
  and that's the point.** It never permitted a driver to see an
  *unassigned* ride (`driver_id IS NULL` can never equal `auth.uid()`).
  Phase 6's `getNextAvailableRideRequest()` queried `rides` directly for
  unassigned rows and would have returned nothing against a real database
  — a latent bug, invisible until this environment's real `tsc`/runtime
  checks became possible, and never actually exercised against Postgres
  before now. `ride_offers` is the correct fix: a driver's own narrow,
  RLS-scoped row (`ride_offers_select_own_driver`, `driver_id = auth.uid()`)
  carrying only the display fields they need, populated by a `SECURITY
  DEFINER` dispatch function — not a widened `rides_select_driver` that
  would let every driver browse every pending ride's passenger identity,
  fare, and addresses.

**Every new `SECURITY DEFINER` function**: `search_path` pinned (`public`,
plus `extensions` where PostGIS functions are called — see §6 item 7),
`EXECUTE` revoked from `PUBLIC` and granted only to `authenticated`
(internal helpers `_get_matching_setting_int`/`_find_eligible_drivers` are
granted to nobody at all — callable only from within another `SECURITY
DEFINER` function, same pattern as Phase 6.2's `_mark_trusted_write`). No
function accepts a caller-supplied driver/user id for anything
privilege-relevant — every function derives the actor from `auth.uid()`
internally.

`ride_offers` has **no client-facing INSERT/UPDATE policy at all** —
offers are created and transitioned exclusively by the matching functions,
mirroring `ride_events`' existing "server-authoritative, not
client-writable" design from Phase 3.

## 8. Race-condition handling

`accept_ride_offer`'s single `UPDATE ... WHERE ... RETURNING` is the
entire race-safety mechanism — not a read-then-write:

```sql
update public.rides
set driver_id = auth.uid(), status = 'accepted', accepted_at = now()
where id = p_ride_id
  and status = 'matched'
  and driver_id is null
  and exists (select 1 from ride_offers where ... status='pending' and expires_at > now())
returning * into v_ride;
```

Under Postgres's standard row-level locking: the first concurrent
transaction to reach this statement acquires an exclusive lock on the
`rides` row and proceeds; a second transaction targeting the same row
blocks until the first commits, then re-evaluates its own `WHERE` clause
against the now-updated row — `driver_id IS NULL` is now false, so the
second transaction's `UPDATE` affects zero rows and `v_ride.id` is `NULL`.
This is the same underlying mechanism as Phase 6.1's `accept_ride_request`
(already reviewed and approved), extended with the offer-validity `EXISTS`
check folded into the *same* `WHERE` clause rather than a separate prior
check.

**This reasoning was not empirically verified against two live concurrent
connections** — no live Postgres instance was available in this
environment. It is standard, well-documented Postgres MVCC/locking
behavior and the identical pattern already in approved use since Phase
6.1, but stated here precisely rather than implied to have been observed.

## 9. Timeout/retry behavior

- Offer expiry is server time (`expires_at > now()` inside the same atomic
  `UPDATE`) — a driver cannot accept an expired offer by manipulating the
  browser; the RPC would simply return `null`.
- The UI countdown (`RideRequestSheet`) now derives from the real
  `ride_offers.expires_at` timestamp when provided, rather than an
  independent local 15-second clock — the display and the actual
  server-side deadline agree by construction.
- Retry/batch progression and eventual termination are described in §2.
  `matching_max_batches` guarantees a ride cannot search forever —
  attempts are counted via `ride_events` (`batch_dispatched`/`batch_empty`
  entries), not `ride_offers.batch_number`, specifically so a
  *zero-driver-found* batch still counts toward the limit (otherwise a
  ride with genuinely no eligible drivers would retry the same batch
  number indefinitely and never terminate).

## 10. Passenger changes

- `/booking/confirm`: calls `startMatching()` immediately after
  `createRide()` succeeds.
- `/booking/matching`: real heartbeat + Realtime subscription, replacing
  the fixed 2.8-second `setTimeout`. Honest **"No drivers available right
  now"** state with Try Again / Back to Home actions when matching is
  exhausted — not silently stuck, not faked as a success.
- `/ride/[id]`: the driver-assignment stepper now reflects real
  `rides.status` via Realtime (mapped through `stepIndexForStatus`), not a
  local counter incrementing on a timer. The driver's real name/vehicle
  type/rating are fetched via the existing
  `drivers_select_active_ride_passenger` policy once assigned. The screen
  also auto-navigates to the payment screen on a real
  `ride_completed`/`payment` status change — closing the loop with the
  Driver app's Navigation screen, which already wrote real status
  transitions since Phase 6.

## 11. Driver changes

- Dashboard: subscribes to real `ride_offers` INSERT events for its own
  `driver_id`, reconciles against authoritative state on mount, reports
  location while online, and calls the new `accept_ride_offer`/
  `reject_ride_offer` RPCs.
- `RideRequestSheet` (shared component): countdown now reflects real
  server expiry when provided.
- Navigation screen: **unchanged** — its OTP verification and status
  writes (Phase 6) were already real and unrelated to matching.

## 12. Admin changes

- Live Rides list: subscribes to `rides` changes (unfiltered, matching its
  existing full-visibility RLS) and refetches automatically. No other
  Admin screen was touched.

## 13. Tests actually executed

Being precise, per the brief's explicit instruction not to overstate this:

| Check | Result |
|---|---|
| `pnpm install` | **Executed.** Clean. |
| `tsc --noEmit`, all 4 apps | **Executed for real, multiple passes** as code was added. Zero errors on the final pass across `passenger`, `driver`, `admin`, `marketing`. |
| `next dev` runtime boot | **Executed.** Passenger: `GET /login` → real `200`; `GET /booking/matching` → real `307` (correct auth redirect, confirming the new Matching screen compiles and the route is reachable). Driver: `GET /dashboard` → real `307` (same confirmation for the rewired Dashboard). |
| SQL migration syntax (paren balance, column-name cross-checks against actual table definitions, enum-value cross-checks) | **Executed as static review** — every column/enum reference in the new migrations was individually grepped against the actual `CREATE TABLE`/`CREATE TYPE` statements it depends on. This is how the `extensions` search_path bug (§6 item 7) was actually found. |
| Concurrent-acceptance race safety | **Reasoned through via documented Postgres locking semantics, not executed.** See §8's explicit caveat. |
| Full scenario walkthrough (timeout, no-drivers, wrong-vehicle-type, offline driver, stale-location driver, busy driver, passenger cancellation mid-matching, unauthorized access) | **Traced through the code path for each scenario against the actual predicates/RLS policies involved (static verification), not executed against a running system.** Detailed below. |
| Live Supabase database/migration execution | **Not executed — no live Supabase project available in this environment**, same standing caveat as every phase since Phase 3. |

### Scenario-by-scenario static trace

- **Wrong vehicle type**: `_find_eligible_drivers`'s `JOIN ... ON
  d.vehicle_type = r.vehicle_type` excludes it at the query level;
  `accept_ride_offer`'s `EXISTS` check additionally requires a real
  `ride_offers` row (which would never have been created for a mismatched
  vehicle), so even a direct RPC call with a fabricated ride id can't
  bypass this.
- **Offline driver**: excluded by `_find_eligible_drivers`'s `d.is_online
  = true` predicate (and the partial GiST index itself).
- **Stale-location driver**: excluded by the `location_updated_at > now()
  - <threshold>` predicate.
- **Busy driver**: excluded by the "not already assigned to a non-terminal
  ride" `NOT EXISTS` subquery.
- **No available drivers**: `_find_eligible_drivers` returns zero rows →
  `dispatch_next_batch` logs `batch_empty` → after `matching_max_batches`
  attempts, ride is cancelled with `no_drivers_available` → Passenger sees
  the honest empty state.
- **Passenger cancels while matching**: `passenger_cancel_matching_ride` —
  traced to correctly supersede pending offers atomically alongside the
  cancellation.
- **Competing driver acceptance**: traced in §8.
- **Unauthorized access**: every function checks `auth.uid() IS NOT NULL`
  and, where relevant, ownership (`driver_id = auth.uid()`, `passenger_id
  = auth.uid()`) before acting; `ride_offers` has no policy permitting a
  driver to read another driver's offers.

## 14. Test results

All static checks (type-checking, runtime boot, migration
cross-referencing) passed, including one real bug found and fixed by the
process itself (§6 item 7). No test in the "requires live Supabase"
category has a result to report — they have not been run.

## 15. Known limitations

- **The heartbeat interval (3s) means up to a ~3-second delay** between an
  offer's server-side expiry and the next batch being dispatched, in the
  worst case (if Realtime doesn't independently trigger it sooner). Not a
  correctness issue — expiry itself is instant and server-enforced — but
  a responsiveness ceiling inherent to the pull-based design.
- **No presence-based disconnect detection.** A driver's app crashing or
  losing connectivity mid-offer is handled purely by the offer's natural
  expiry, not by detecting the disconnect itself. This is consistent with
  `is_online` already being a manual toggle rather than a heartbeat-based
  presence system — adding real presence detection would be a materially
  larger feature, not attempted here.
- **City matching degrades gracefully to "unscoped" when `ride.city_id` is
  `NULL`** — which is always, today, since no city-selection UI exists in
  the booking flow (`createRide`'s `cityId` parameter is optional and
  currently never passed by the Passenger app). The architecture supports
  Vijayawada/Hyderabad/future cities correctly the moment a caller starts
  passing it; wiring an actual city-selection screen is explicitly a UI
  change out of this phase's scope.
- **`ride_offers`' denormalized snapshot fields can drift from the live
  `rides` row** if, hypothetically, a ride's fare were edited after an
  offer was already sent (nothing in this codebase does that, but it's a
  structural possibility worth naming) — offers are point-in-time
  snapshots by design, not live views.

## 16. Deferred work

Exactly matching this phase's explicit exclusions — stated here as
confirmation they were respected, not as new decisions:

- No payment gateway integration; matching uses `rides.total_fare` as
  authoritative and no function in this phase writes to any fare column.
- No Google Maps/routing/ETA integration — `distance_to_pickup_meters` is
  computed via PostGIS `ST_Distance` for internal ranking/audit only,
  never surfaced as a real-time map or route.
- No complex nationwide geofencing — city matching is a simple equality
  check against `cities`, nothing more.

## 17. Recommended Phase 9

Two reasonable directions:

1. **Fine-grained per-permission RBAC enforcement at the RLS/RPC layer**
   (`has_permission()`, built since Phase 3, still not called by any
   policy) — now that Admin has a real operational surface (Phases 7–8),
   this is the most concrete remaining gap between the proposed RBAC model
   and what's actually enforced.
2. **Payment gateway integration** — explicitly deferred across Phases 5
   through 8 consistently; every money-touching surface (subscription
   purchase, ride payment method, matching's authoritative fare) is
   already structured to slot a real payment flow in without further
   architecture changes.

---

Phase 8 complete. Not starting Phase 9.
