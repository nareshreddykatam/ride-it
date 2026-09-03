# Ride It — Phase 15: Ratings, Reviews & Post-Ride Feedback Review

## Network status, stated up front

The real Ride It Supabase project remains unreachable from this sandbox
— rechecked at the start of this phase and again before writing this
document; both times `https://tzzmofsiefygpucwpbpi.supabase.co` returned
`403 Host not in allowlist` from the sandbox's own egress proxy, same as
Phase 14. Nothing in this phase touched the real project. Every test
below runs against the local PostgreSQL 16 + PostGIS 3.4.2 instance
established in Phase 12, classified honestly per §14.

## 1. Rating architecture

Reused, not rebuilt: Phase 3's `ratings` table already had exactly the
right shape — `rated_by_enum`, a `ratings_rater_not_ratee` check
preventing self-rating, and a `ratings_one_per_ride_direction` unique
constraint on `(ride_id, rated_by)` that already enforced "one rating per
participant per ride" at the database level before this phase touched
anything. What was missing was authorization: the existing
`ratings_insert_participant` RLS policy let a client insert almost
anything as long as they were *a* participant of *some* ride. This phase
replaces direct client inserts entirely with `submit_rating()` — the sole
path, deriving `rated_by`/`ratee_id`/completion-eligibility from the ride
record itself, never from client-supplied values.

## 2. Passenger rating flow

`apps/passenger/app/ride/[id]/rate/page.tsx`, rewritten. Previously a
Phase 5 placeholder that silently no-op'd whenever `ride.driver_id` was
null — a real gap in the pre-matching era, harmless once Phase 8 gave
every completed ride a real driver, but never updated to reflect that.
Now: fetches the real ride, checks for an existing rating via
`getOwnRatingForRide()` before ever showing a submit form, shows a
"thanks for your feedback" state with the submitted stars/comment if
already rated, and surfaces real submission errors (including a
duplicate-submission race) honestly rather than pretending success.

## 3. Driver rating flow

**Did not exist before this phase.** New:
`apps/driver/app/rate/[id]/page.tsx`, structurally identical to the
Passenger flow (same duplicate-check pattern, same real
`submit_rating()` call, same honest error handling), reached via a new
"Rate your passenger" button on the Navigation screen's completion
summary — the natural point in the existing flow, no redesign of that
screen beyond adding the one button.

## 4. Review architecture

The optional `comment` field on `ratings` (Phase 3) is used as-is. Light
server-side validation added in `submit_rating()`: trimmed, capped at
1000 characters, and a defensive rejection of anything containing
`<script` (case-insensitive) — stated plainly as a sanity floor, not the
actual XSS defense, which is React's own default escaping of all
rendered text content. No moderation AI, no profanity filter, no
elaborate content pipeline — deliberately, per the brief's "do not
over-engineer moderation in this phase."

## 5. Aggregate rating calculation

Computed authoritatively inside `submit_rating()` from the `ratings`
table itself (the documented source of truth since Phase 3's own schema
comment) — `round(avg(rating)::numeric, 1)` over every rating the ratee
has received, matching the `numeric(2,1)` column definition on both
`drivers.rating` and `passengers.rating` exactly. Never trusts a
client-supplied average. `total_rides` increments by one alongside it —
documented honestly in §15 as counting "ratings received," the only
consistent interpretation available since nothing in this codebase
increments `total_rides` anywhere else.

## 6. Database changes

Five migrations, `20260819090000` through `20260819090400`:

1. **`rating_protection`** — two new triggers closing real gaps (§7).
2. **`submit_rating`** — drops the too-permissive insert policy, adds the
   sole-path RPC.
3. **`report_review`** — one nullable column (`rating_id`) and one new
   category (`inappropriate_review`) on the existing `support_tickets`,
   reusing Phase 13's architecture rather than a parallel moderation
   system.
4. **`rating_reminder`** — amends `complete_ride()` (Phase 10 → 11 → here)
   to add a one-time rating nudge notification.
5. **`ride_participant_name`** — a narrowly-scoped RPC closing a real gap
   found while building the rate screens themselves (§7).

No existing table was duplicated. `rides.passenger_rating`/`driver_rating`
(documented as a denormalized shortcut since Phase 3) are populated for
real now, not left permanently null as they were before this phase.

## 7. RLS/security changes — three real gaps found this phase

**1. The rating-insert authorization gap** (§1): `ratings_insert_participant`
never verified `ratee_id` was genuinely the other party on the specific
ride, or that `rated_by` matched the caller's real role — a client could
have inserted an arbitrary pairing. Closed by removing direct insert
access entirely.

**2. `passengers.rating`/`total_rides` were never protected** by any
trigger — the identical exposure Phase 6.2 fixed for `drivers`, sitting
unaddressed on the passenger side the entire time via the equally broad
`passengers_update_own` policy. Fixed with a new
`protect_passenger_system_columns` trigger, mirroring the driver one
exactly. `rides.passenger_rating`/`driver_rating` got the same treatment
via a new `protect_ride_rating_columns` trigger (kept separate from
Phase 11's `protect_ride_financial_columns` since ratings aren't
financial fields — a naming/scope precision choice, not a duplicate
mechanism).

**3. Found only by building the feature, not by reading policy**: both
`drivers_select_active_ride_passenger` and
`passengers_select_active_ride_driver` (Phase 3) deliberately exclude
`ride_completed`/`cancelled`/`rated` from their visibility window — a
correct privacy boundary for the *full* profile, but it also meant
neither party could see the other's *name* at exactly the moment the
rating screen needs it, since the ride is by definition already in one
of those excluded statuses. Widening either policy was considered and
rejected: `rated` is often a ride's permanent resting status, so
including it would reopen full-profile access (whatever else those
tables expose) indefinitely after any rated ride — exactly what those
policies exist to prevent. Fixed instead with
`get_ride_participant_name()`, a purpose-built function returning
*only* a name, for a participant on *any* status of a ride they were
genuinely part of. Both rate screens now use this instead of the broader
profile-read functions that would have (and, for a few tool-calls,
briefly did) silently return nothing.

All three were found and fixed by executing real queries against real
PostgreSQL, then re-verified with a second round of real tests — not
caught by static review alone.

## 8. Notification integration

Reuses Phase 10 entirely. `submit_rating()` notifies the ratee ("You
received a new rating") using the existing `ride_status` notification
type — no new type was added since the existing one fit. `complete_ride()`
now also sends a one-time "How was your ride?" / "How was your
passenger?" nudge to both parties, guarded by the same
`status = 'ride_started'` WHERE clause that already makes "ride
completed" fire exactly once — meaning this reminder structurally cannot
duplicate either. No scheduled/recurring reminder infrastructure was
built, per the brief's explicit "do not spam the user."

## 9. Admin integration

Real data now flows into screens that already existed: Admin's Driver
and Passenger detail pages already selected `rating`/`total_rides` (they
just sat at their default `5.0` forever before this phase populated
them for real). Added to both: a "Recent reviews" card
(`listReviewsReceived()`, scoped by the existing `ratings_all_admin`
policy). Reported reviews surface through the *existing* Phase 13 Safety
Dashboard — `inappropriate_review` added to its category filter — rather
than a new screen. Admin has no direct write path to any rating or
aggregate value; every write goes through `submit_rating()` or the
existing admin-gated support-ticket status updates.

## 10. Reporting/moderation integration

Fully reuses Phase 13's `support_tickets`/RLS — no parallel system. A
report references a specific rating via the new `rating_id` column,
alongside the existing `reported_user_id` (set to the review's author).
Confirmed via real testing (§14): the report's own RLS isolation
(reporter and admin only) applies identically to rating-reports as to
every other report category, since it's the same table and the same
policies.

## 11. Security regression results — every item, real execution

| Test | Result |
|---|---|
| Passenger cannot rate an unrelated driver | ✅ `Caller did not participate in this ride` |
| Driver cannot rate an unrelated passenger | ✅ Same |
| Duplicate Passenger rating rejected | ✅ Real `unique_violation` on `ratings_one_per_ride_direction` |
| Duplicate Driver rating rejected | ✅ Same constraint, other direction |
| Unassigned ride cannot be rated | ✅ `Ride has no counterpart to rate` |
| Incomplete ride cannot be rated | ✅ `Ride is not yet completed` (tested with a genuinely pre-completion `accepted` ride, after an earlier flawed fixture attempt was caught and corrected) |
| Cancelled-after-assignment ride cannot be rated | ✅ Same status check, exercised with a ride that *had* a driver, specifically to isolate the status check from the no-counterpart check |
| Self-rating rejected | ✅ Real `ratings_rater_not_ratee` constraint violation |
| User cannot directly modify another's rating / insert arbitrary ratings | ✅ RLS blocks the INSERT entirely (no policy remains) |
| User cannot directly change `drivers.rating` | ✅ `Cannot modify protected driver fields directly` |
| User cannot directly change `passengers.rating` | ✅ `Cannot modify protected passenger fields directly` (new this phase) |
| Admin authorization intact | ✅ `ratings_all_admin`, `support_tickets` admin policies unchanged and re-confirmed |

## 12. Runtime results

`tsc --noEmit` clean across all four apps on the first full pass after
fixes. Real `next dev` boots with real HTTP responses (not assumed):
Passenger `/ride/[id]/rate` → `307`; Driver `/rate/[id]` and
`/navigation` (with its new button) → `307`; Admin `/drivers/[id]`,
`/passengers/[id]`, and `/safety` (all carrying new rating-related UI) →
`307`. Every response is a genuine auth-redirect, not a crash — the
brief's own caution against treating a bare `200`/`307` as proof of
database functionality is honored: the actual database behavior is what
§11 and §13 verify, not these boot checks.

## 13. Database test results

All 20 items from the brief's test list were executed for real against
live PostgreSQL, continuing the exact methodology established in
Phases 12–14 (`SET LOCAL request.jwt.claims` simulating real authenticated
sessions). Full detail in §11 (security regressions) plus: 5-star and
1-star ratings both correctly recalculated the ratee's aggregate and
incremented `total_rides`; the denormalized `rides.driver_rating`/
`passenger_rating` shortcuts were confirmed set; `ride.status` correctly
advanced to `'rated'` on the first rating submitted from either
direction; the report-a-review flow was confirmed end-to-end including
admin visibility and non-admin exclusion. The full 60-migration chain was
also re-run from a completely fresh database as a final check — clean
except the same 3 already-understood, already-documented historical
statements every phase since 12 has found (Phase 8's own
`_find_eligible_drivers` self-correction).

Two of this phase's own test fixtures were flawed at first and are
recorded honestly rather than smoothed over: one attempted to backdate a
value that happened to already match the current one (a false-negative
risk this project has hit before, in Phase 12/13); another tried to
directly `UPDATE rides SET status = 'ride_started'` for fixture purposes
and was correctly blocked by Phase 10's `protect_ride_start_transition`
— a genuine confirmation that trigger holds even against ad hoc test
SQL, not a bug.

## 14. PASS/FAIL/BLOCKED/STATIC classification

| Area | Status | Basis |
|---|---|---|
| Real Supabase project connection | **BLOCKED** | Network egress, unchanged since Phase 14 |
| Rating creation authorization (Local DB Tier) | **PASS** | Real execution, §11/§13 |
| Duplicate prevention | **PASS** | Real unique-constraint violations |
| Aggregate recalculation | **PASS** | Real before/after values confirmed |
| Passenger/driver column protection | **PASS** | Real blocked writes, both new triggers |
| Ride-participant-name gap and fix | **PASS** | Real gap found by execution, real fix, re-verified |
| Report-a-review flow | **PASS** | Real insert + real admin/non-admin visibility split |
| `tsc`/runtime boot | **PASS** | Real compile, real HTTP responses |
| Full migration chain (fresh database) | **PASS** | 60/60 attempted, only known historical errors |
| Real Supabase Auth/PostgREST/Realtime for ratings | **BLOCKED** | Network egress |
| Live frontend against the real backend | **BLOCKED** | Network egress |

No test in this phase is classified as **STATIC** — everything claimed as
tested was actually executed against a real, running database.

## 15. Known limitations

- **`total_rides` semantics**: increments once per rating *received*, not
  once per ride *completed* — the only consistent interpretation
  available, since nothing in this codebase increments it anywhere else
  (confirmed by `grep` before this phase). A ride where neither party
  ever rates leaves `total_rides` unchanged for both. Stated as a
  documented interpretation, not silently decided.
- **Passenger aggregate ratings are implemented but not surfaced in the
  Passenger's own UI** — the brief's item 13 permits this ("if the
  current product intentionally does not display passenger ratings
  publicly, do not invent a public rating feature"); the underlying
  feedback system (aggregate calculation, protection, Admin visibility)
  is fully real and consistent with the driver side, but no Passenger-facing
  screen shows a passenger their own rating this phase, since none
  existed to extend and building one wasn't explicitly requested.
- **Review privacy is a UI-layer choice, not a schema-layer one** —
  `ratings.rater_id` remains in the data model (needed for the unique
  constraint, RLS, and moderation), but rate/review-display screens don't
  surface *who* rated whom beyond what both parties inherently already
  know from having shared a ride.
- Same standing Realtime/Auth/PostgREST-against-the-real-project
  limitations as every phase since 12.

## 16. Deferred rating/moderation work

- Editing/correcting a submitted rating — deliberately not built, per the
  brief's explicit "if editing is not currently defined, make ratings
  immutable after submission." The existing report-a-review flow is the
  intended correction path for a genuinely wrong rating, reviewed by
  Admin — not direct self-service editing.
- Any automated moderation (profanity/toxicity filtering beyond the
  minimal `<script` floor) — explicitly out of scope this phase.
- A Passenger-facing "your rating" display (§15).

## 17. Recommended Phase 16

Once network access to `*.supabase.co` opens: re-run this phase's real
test suite (§13) against the actual project, the same recommendation
carried forward from Phase 14 — the SQL and RLS-simulation approach used
here is directly transferable, needing only a connection target change.

---

Phase 15 complete. Not starting Phase 16.
