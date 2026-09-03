# Ride It — Phase 13: Safety, Emergency & Support Review

## 1. Safety architecture

A Safety section reachable from an active ride in both Passenger and
Driver apps (a red "Safety" pill over the map, replacing the old
placeholder "SOS" pill) opening a bottom-sheet-style menu: SOS/Emergency,
Share this ride (Passenger only), Trusted contacts (Passenger only),
Report an issue/passenger, and — when configured — a tap-to-call
emergency number. Driver's version swaps "Share ride" for "Report this
passenger" and omits trusted contacts (a passenger-only concept). Neither
app's existing UI was redesigned; the safety menu is an addition, not a
rebuild — the ride-status screens, matching flow, PIN verification, and
payment screens are all untouched.

## 2. SOS architecture

`safety_events` (new table) — real records, not a UI-only placeholder.
`trigger_sos()` is the sole creation path: derives the triggering user's
role server-side (never trusted from the client), optionally validates
the caller is genuinely a party to the referenced ride, and fans out a
notification to every current admin. Location is a best-effort snapshot
from the device's own browser geolocation at the moment of activation
(`getCurrentPositionOnce()`, already built in `@ride-it/maps`) — "latest
authorized location if available," not a live-tracked stream. The
triggering user can read their own event history but has **no update
policy at all** — status only ever changes through `set_safety_event_status()`,
which independently re-checks `is_admin()`. This directly satisfies "do
not automatically mark an SOS resolved merely because the user closes the
screen" — there's no path for the client to do that even accidentally.

## 3. Trusted contacts

Owner-only CRUD (`trusted_contacts`), soft-deleted rather than
hard-deleted to preserve an audit trail of additions/removals without a
separate logging table. **Deliberately no admin read policy** — the same
reasoning as Phase 10's Ride PIN: there is no legitimate operational need
for Admin to browse a passenger's personal contact list, and the brief
explicitly lists "accessing another user's emergency information" as
something to prevent. A real safety investigation works from the
`safety_events`/`support_tickets` record (what happened, where), not from
reading someone's address book.

## 4. Ride sharing

The most security-sensitive new surface this phase, and — as far as this
project's own history goes — the first genuine exception to "no `anon`
access, ever," a posture held consistently since Phase 3 and reaffirmed
explicitly in Phase 12's own RLS testing. `create_ride_share()` generates
a 256-bit CSPRNG token (`pgcrypto gen_random_bytes(32)`, hex-encoded — the
same generator class as Phase 10's Ride PIN, just sized for an
unguessable bearer token rather than a human-typed 4-digit code), capped
to a maximum 12-hour duration regardless of what's requested, and returns
the token exactly once (same one-time-reveal principle as the Ride PIN).
`get_shared_ride_info(token)` is the one function in this entire project
granted to `anon` — narrowly scoped to a fixed field set (ride status,
driver name, vehicle type, pickup/drop address, driver's live location),
never fare, never the Ride PIN, never the passenger's phone or email. It
re-validates expiry, revocation, **and that the underlying ride is still
non-terminal** on every single call — not just at share-creation time —
so a share becomes worthless the instant the ride ends, regardless of its
stored `expires_at`.

**A real bug was found and fixed by actually running this code**:
`create_ride_share`'s `RETURNS TABLE (id uuid, ...)` created a PL/pgSQL
scoping collision — inside the function body, the bare identifier `id`
was ambiguous between the function's own output column and
`rides.id`, since `RETURNS TABLE` columns become implicitly-scoped
variables throughout the function. Caught immediately by real execution
(`column reference "id" is ambiguous`), fixed with an explicit table
alias, then re-verified working with a real 64-character token.

## 5. Location privacy

No new location endpoint of any kind was created. The Phase 8/9 model is
reused exactly: `get_shared_ride_info()` reads `drivers.current_location`
through the same `ST_X`/`ST_Y` decode pattern `get_ride_tracking()` has
used since Phase 9, and only for the one ride the token was issued for —
there is no way to pass a different ride id, search by location, or
enumerate other rides through this function. A trusted contact cannot
"look up" a ride; they can only read the one ride whose token they
possess.

## 6. Reporting

Extends `support_tickets` (Phase 3) rather than creating a parallel
`reports` table, per the brief's explicit instruction. One new column,
`reported_user_id` (nullable — most tickets have no reported party), and
five new categories (`safety`, `driver_issue`, `passenger_issue`,
`lost_item`, `app_problem`) alongside the three that already existed
(`ride_issue`, `payment_issue`, `other`). "Cannot arbitrarily change
report ownership" was **already structurally guaranteed** before this
phase touched anything — `support_tickets` has an insert-own policy but
no update-own policy at all, confirmed by reading the Phase 3 RLS
directly; a reporting user can create a ticket but never modify it
afterward, by anyone but an admin.

## 7. Support integration

`severity` (new column, default `'medium'`) added to `support_tickets` —
used by both general tickets and safety reports, since the Admin Safety
Dashboard needed a severity signal the brief itself called out and
nothing in the existing schema provided it. `listSupportTicketsAdmin()`
(new, in `admin.ts`) is the first admin-wide (not ride- or user-scoped)
support ticket listing function — the two that existed before
(`listSupportTicketsForUser`/`listSupportTicketsForRide`, Phase 7) were
both intentionally narrow and remain unchanged.

## 8. Admin safety handling

A new "Safety" item in Admin's sidebar (distinct icon from the existing
"Live Rides" item, which already used a similar shield glyph) leading to
a dashboard showing real `safety_events` (filterable by status, with
inline Acknowledge/Investigating/Resolve actions calling the real admin
RPC) and open safety-related `support_tickets`, each linking through to
the relevant ride detail page where one already exists. No new RBAC
concept was introduced — this reuses `is_admin()` exactly as every other
Admin screen has since Phase 7; `set_safety_event_status()` independently
re-checks it itself, not just at the RLS layer.

## 9. Notifications

Reuses the Phase 10 architecture entirely — one new
`notification_type_enum` value (`'safety'`), no new delivery mechanism.
SOS activation notifies every admin; a safety event's status change
notifies the person who triggered it. No SMS is sent for any of this (no
SMS provider is configured in this environment regardless — unchanged
from every prior phase), and no location-update spam — a triggering
user's live position is never pushed as a stream of notifications, only
the single snapshot captured at activation.

## 10. Database changes

Five migrations, `20260818090000` through `20260818090400`: schema
extensions (enums + `support_tickets` columns + a configuration-driven
`emergency_contact_number` app_settings row), `trusted_contacts`,
`safety_events` (+ `trigger_sos`/`set_safety_event_status`), `ride_shares`
(+ the three sharing RPCs), and adding `safety_events` to the Realtime
publication for the Admin dashboard's live updates. No existing table was
duplicated — `notifications`, `support_tickets`, `ride_events`, and
`app_settings` were all extended or reused rather than replaced.

## 11. RLS/security changes

No existing RLS policy or protective trigger from Phases 3–12 was
weakened — `protect_ride_financial_columns`, `protect_ride_start_transition`,
`protect_driver_system_columns`, and every RLS policy touched by earlier
phases were left exactly as they were. New policies: `trusted_contacts_all_own`
(owner-only, no admin), `safety_events_select_own` + `safety_events_all_admin`
(no owner-update policy — see §2), `ride_shares_all_own_passenger` (the
recipient never queries this table directly at all — only through the
`SECURITY DEFINER` read function). The one deliberate `anon` grant
(`get_shared_ride_info`) is documented at length in its own migration
comment, not treated casually.

## 12. Audit logging

No new generic audit-log table was created — each safety-domain concern
already carries its own audit trail on the structure that represents it:
`trusted_contacts.deleted_at` (soft delete, preserves add/remove
history), `ride_shares.created_at`/`revoked_at` (the share record itself
is the audit trail), `safety_events.status`/`updated_by`/`acknowledged_at`/`resolved_at`
(who changed what, when), and a `ride_shared` `ride_events` row inserted
alongside every `create_ride_share()` call (reusing the existing,
already-admin-readable `ride_events` audit table for the one
ride-scoped event in this phase's scope). **Never logged anywhere**: the
Ride PIN or its hash, any payment secret, any API key. Confirmed by
`grep`-ing every new file for `pin`/`secret`/`password` before considering
this done — none appear outside comments explaining why they don't.

## 13. Data retention considerations

Documented, not silently decided:

- **SOS events**: no automatic deletion. These are the closest thing this
  system has to an incident record; deleting them on any timer would
  destroy exactly the audit trail a real safety review would need. If a
  retention *ceiling* is ever required (e.g., for a legal/compliance
  reason), that's a business decision this phase does not have the
  authority to invent — flagged here rather than guessed at.
- **Safety reports** (`support_tickets`): same reasoning — no automatic
  deletion.
- **Share tokens** (`ride_shares`): the tokens themselves become
  functionally inert (unusable) the moment they expire, are revoked, or
  their ride ends — but the *rows* are not deleted, since they double as
  part of the ride's own history. Storing an inert token is not a
  meaningful privacy exposure (it grants no access once expired), so
  there's no urgency to delete it, but no explicit retention ceiling was
  invented here either.
- **Location snapshots** (`safety_events.latitude/longitude`): a single
  point captured once, not a stream — meaningfully less retention concern
  than continuous tracking would be. Kept alongside the safety event it
  belongs to for the same audit reasoning as above.

## 14. Tests actually executed

**Continuing Phase 12's real-PostgreSQL validation approach** — every
claim below is a genuine query result against a real, running PostgreSQL
16 + PostGIS 3.4.2 database, not a static read of policy definitions.

| Test | Result |
|---|---|
| Passenger creates/edits/soft-deletes a trusted contact | ✅ Real inserts/updates, confirmed via `SELECT` |
| Driver cannot read Passenger's trusted contacts | ✅ 0 rows |
| Unrelated Passenger cannot read another's trusted contacts | ✅ 0 rows |
| Passenger activates SOS (no ride) | ✅ Real row created, real admin notification created |
| Driver activates SOS (with ride) | ✅ Real row, correct `triggered_by_role`/`ride_id` |
| Unrelated user cannot read another's SOS event | ✅ 0 rows |
| Triggering user cannot self-resolve their own SOS | ✅ `UPDATE 0` — no policy permits it |
| Driver cannot attach SOS to an unrelated ride | ✅ Real rejection: `Caller is not a party to this ride` |
| Admin acknowledges then resolves via the real RPC | ✅ Both transitions succeeded, timestamps set correctly |
| Non-admin cannot change safety event status | ✅ Real rejection: `Only admins may change...` |
| Passenger creates a report against a driver; driver against a passenger | ✅ Both real inserts, correct category/severity/`reported_user_id` |
| Reporter cannot change report ownership | ✅ `UPDATE 0` — no such policy exists |
| Unrelated passenger cannot see another's report | ✅ 0 rows |
| Admin can see both reports | ✅ Confirmed |
| Passenger creates a real ride share, gets a real 256-bit token | ✅ 64 hex chars confirmed |
| `anon` (unauthenticated) reads shared ride info with a valid token | ✅ Real data returned |
| `anon` with a wrong/guessed token | ✅ 0 rows, no distinguishing error |
| `anon` cannot query `ride_shares` directly | ✅ 0 rows, even though the RPC is `anon`-accessible |
| `anon` cannot read `rides` at all | ✅ Same `permission denied for function is_admin` wall Phase 12 found |
| Share becomes invalid after real expiry | ✅ 0 rows (tested via a directly-inserted already-expired row, after confirming the table's own `expires_future` constraint correctly rejects backdating) |
| Share becomes invalid after explicit revocation | ✅ 0 rows |
| Share becomes invalid the moment the ride completes, independent of expiry/revocation | ✅ 0 rows |
| `tsc --noEmit`, all 4 apps | ✅ Executed for real. Found and fixed two real type errors (a `BottomSheet` prop mismatch; a raw `.insert()` resolving to `never` against the placeholder Database type — fixed with a proper typed wrapper, the established Phase 11 pattern) |
| `next dev` runtime boot, new screens | ✅ Real `200` from the public `/shared/[token]` page; real `307`s (correct auth-redirect) from Trusted Contacts, the Passenger ride screen, Driver navigation, and Admin's Safety dashboard |
| Full 55-migration chain, fresh database | ✅ Executed twice — once incrementally during development, once as a final from-scratch run. Found and fixed a real portability bug in the test harness itself (see below) |

**A second real bug, in the test harness, found by this phase's own
rigor**: the compatibility shim's search_path fix hardcoded the database
name `rideit_test` — meaning it silently did nothing against any other
database, including whatever database `.github/workflows/ci.yml` (built
in Phase 12) actually targets. Found by deliberately testing against a
second, differently-named database; fixed with dynamic SQL
(`EXECUTE format(..., current_database())`) so the fix now applies
correctly regardless of database name — re-verified against the
differently-named database before considering it resolved.

## 15. Test results

All static, `tsc`, runtime-boot, and real-database tests passed after the
fixes described above. No emergency-service integration was tested,
because none exists (see §16).

## 16. External integrations required

- **None currently exist, and none were fabricated.** Ride It has no API
  integration with police, ambulance, or any emergency-dispatch service
  anywhere in this codebase. The "Call emergency" action is a plain
  `tel:` link using a configuration-driven number
  (`app_settings.emergency_contact_number`, seeded with India's real
  public national emergency number) — a phone dial action, not an API
  call, and the UI never claims otherwise (see §19 of the brief,
  addressed directly in the SOS-confirmation screen's own copy: "Ride It
  has not contacted police or emergency services on your behalf").
- A real SMS provider, if a future phase decides safety events should
  also trigger SMS — not built or assumed here.
- Real push credentials (Phase 10's `notification_devices`, unchanged)
  for the admin SOS notification to reach a phone that isn't actively
  looking at the Admin dashboard.

## 17. Known limitations

- **General (non-ride) safety access is limited.** Trusted Contacts
  management is reachable anytime from Profile, but SOS and Report are
  currently only exposed from the active-ride Safety sheet — matching
  the brief's literal "for an active ride, provide..." framing for items
  1 and 2, but meaning a passenger/driver without an active ride has no
  in-app SOS button. Named explicitly as a scope boundary, not an
  oversight.
- The compatibility shim's `anon`/`authenticated`/`service_role` roles
  are cluster-wide in Postgres, not per-database — re-running the shim
  against a second database in the same cluster prints three expected
  "role already exists" errors (harmless; confirmed the rest of the shim
  still applies correctly), a real quirk of this sandbox's specific setup
  worth knowing about if reused elsewhere.
- The share-recipient page (`/shared/[token]`) polls every 10 seconds
  rather than using Realtime — a deliberate choice for a one-off,
  unauthenticated recipient view (no persistent websocket session to
  maintain), not tested against a scenario with many simultaneous
  viewers.
- As with every phase since Phase 3: no live Supabase project exists.
  Real GoTrue session behavior, real PostgREST request handling, and real
  Realtime delivery for the new `safety_events` publication addition were
  not and could not be tested here.

## 18. Deferred safety work

- General (non-ride-context) SOS/report access (§17).
- Any SMS-based safety alerting.
- A dedicated, downloadable/printable incident report for admin.
- Rate-limiting or abuse-prevention on `trigger_sos()`/`create_ride_share()`
  beyond what RLS and the function's own validation already provide — not
  identified as a concrete requirement this phase, but worth naming as an
  open question for a system that will eventually see real usage volume.

## 19. Recommended Phase 14

Two reasonable directions:

1. **A real Supabase project + real RLS/Realtime validation** — Phase 12
   already recommended this for the payment/matching/PIN systems; this
   phase's entire safety test suite (§14) is written as real, reusable
   SQL and would need only a connection-string change to become genuine
   live-Supabase validation, same as Phase 12's own recommendation.
2. **General safety access** — extending SOS/Trusted-Contacts/Report
   reach beyond the active-ride context (§17), the most concrete deferred
   item from this phase's own explicit scope boundary.

---

Phase 13 complete. Not starting Phase 14.
