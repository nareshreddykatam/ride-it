# Ride It — Phase 7: Production Admin Operations Review

## 1. What was implemented

Every existing Admin route was upgraded from mock arrays to real
Supabase-backed data. No screen was rebuilt from scratch — each page kept
its existing `Card`/`DataTable`/`StatusPill`/`Skeleton`/`EmptyState`
structure; only the data source and the interactive logic changed. One new
route (`Cities`) was added because no existing screen covered it.

**New shared data layer**: `packages/data/src/admin.ts` (~870 lines) —
every admin query and mutation used by this phase lives here, following
the same pattern already established by `rides.ts`/`drivers.ts` etc.
(plain functions taking a `SupabaseClient` parameter, no app-specific
assumptions). It was **not** built on `@ride-it/api-client` — that
package remains the confirmed-dead REST-shaped code flagged in the Phase
4.5/6.2 reviews, untouched again this phase.

**One schema migration**: `drivers.verification_notes` (a driver-level
field for admin approval/rejection commentary — the existing
`driver_documents.rejection_reason` is per-document, not driver-level).
It extends the existing Phase 6.2 `protect_driver_system_columns()`
trigger rather than introducing a new mechanism — drivers cannot write
this field themselves, same as `verification_status`/`rating`/
`strike_count`.

**No new broad SECURITY DEFINER functions were added.** This is the
central architectural finding of this phase, explained in §5.

---

## 2. Routes changed

| Route | Status |
|---|---|
| `/overview` | Real counts (drivers online, rides today, active subscriptions, open tickets) and real revenue split (subscription revenue vs. ride fare volume, both real sums for the current month) |
| `/drivers` | Real list, search, status filter |
| `/drivers/[id]` | Real profile, real document review (signed URLs, approve/reject with reason), real subscription/earnings summary, driver-level approve/reject/suspend with notes |
| `/passengers` | Real list, search |
| `/passengers/[id]` | Real profile, real ride history, real support tickets, suspend/reactivate |
| `/rides` (Live Rides) | Real query against non-terminal statuses |
| `/rides/[id]` | Real trip details, real ride-event history (append-only, admin can add notes but never edit/delete existing events), real complaint/support-ticket display with resolve action, cancel with reason, reassign driver, flag driver for review |
| `/subscriptions` | Real plan pricing (editable), real active-subscriber counts, real payment history |
| `/analytics` | Real ride-trend and subscriber-growth charts (client-bucketed from real rows), real rating averages, real cancellation rate — all with honest empty states when there isn't enough data |
| `/admin-users` (RBAC) | Real roles/permissions/role-permission matrix, real admin account list, role reassignment gated to super admins only |
| `/settings` | Real pricing rules, real maintenance-mode toggle, real app-version display, real language list |
| **`/cities`** (new) | Real city list, activate/deactivate, add city — reflects the Vijayawada → Hyderabad → additional cities launch order |

---

## 3. Database queries/mutations added

All in `packages/data/src/admin.ts`, organized by domain: Overview/
Analytics (6 functions), Drivers (4), Passengers (4), Support tickets (3),
Rides (7), Subscriptions (4), Cities (3), Settings (4), RBAC (6). Two
existing modules were extended, not duplicated: `documents.ts` gained
`getDriverDocumentSignedUrl()` and `reviewDriverDocument()`; `drivers.ts`
gained `verification_notes` to the existing `getDriverProfile()` shape.

---

## 4. Migrations added

Exactly one: `20260812090000_admin_verification_notes.sql`. Adds the
column, extends the Phase 6.2 trigger. No RLS policies were added, dropped,
or weakened this phase — the existing Phase 3 policies already covered
everything this phase needed (see §5).

---

## 5. RBAC / security decisions — the central finding of this phase

**Almost every admin write in this phase is a plain authenticated table
call, not an RPC.** This wasn't a shortcut — it's because Phase 3 already
gave nearly every table a `*_all_admin` policy (`using (is_admin())`),
which means an ordinary `supabase.from(table).update(...)` call already
either succeeds safely (real admin session) or fails at the database
(anyone else) with no code in `admin.ts` needing to duplicate that
enforcement. Building new RPCs for actions RLS already secures correctly
would only add privileged-function surface area with no corresponding
security benefit — which is exactly what item 13 of this phase's brief
warned against ("do not create broad SECURITY DEFINER functions").

**Every function's docstring in `admin.ts` states which RLS policy makes
it safe**, so this isn't an implicit assumption — it's checked and written
down at each call site.

**The one rule given extra emphasis — a driver approving themselves —
was verified already closed by *existing* mechanisms, not a new one**:
`protect_driver_system_columns()` (Phase 6.2) rejects
`verification_status`/`rating`/`strike_count`/`verification_notes` changes
from any non-admin session, and `drivers_all_admin`'s RLS predicate itself
requires `is_admin()` to write outside a driver's own narrow self-scope.
`setDriverVerificationStatus()` in `admin.ts` is a plain UPDATE for
exactly this reason — I evaluated wrapping it in an RPC and judged it
unnecessary, since an RPC would enforce nothing the trigger doesn't
already enforce.

**RBAC screen**: role reassignment (`updateAdminUserRole()`) is gated
entirely by the existing `admin_users_write_super_admin` policy
(`using (is_super_admin())`, Phase 3) — an ordinary admin's UPDATE simply
matches zero rows. The UI additionally hides the reassignment control for
non-super-admins, but that's explicitly documented as a convenience, not
the security boundary. The function never touches `is_super_admin` at
all — that flag remains settable only through `provision_admin_user()`
(service-role only, Phase 6.2), which this phase did not touch, weaken, or
duplicate.

**Admin authorization for the app itself** (item 2 of the brief) required
no new code — the existing Phase 4 `middleware.ts` + `RequireRole` guard +
RLS stack already rejects non-admin sessions server-side before any admin
page renders. This was re-confirmed at runtime this phase (see §8), not
just assumed.

---

## 6. RLS/RPC changes

**None.** No RLS policy was added, dropped, or modified. No new RPC
functions were created. This phase is purely additive at the schema level
(one column) and entirely additive at the application level.

---

## 7. Mock data removed

Every hardcoded array from the original Admin build was deleted: `STATS`
(Overview), `DRIVERS`, `DOCUMENTS`/`docStatus` (Driver Detail),
`PASSENGERS`, `RIDE_HISTORY`, `RIDES`, `PLANS`/`PAYMENTS` (Subscriptions),
`RIDE_TRENDS`/`SUBSCRIPTION_GROWTH` (Analytics), `ROLES`/`ADMINS`
(Admin Users), and the Settings screen's hardcoded pricing/maintenance
state. Nothing was left silently mixed with real data — every screen is
either fully real or explicitly marked as deferred (Notifications
templates in Settings, refunds in Ride Detail).

---

## 8. Validation actually executed

Being precise about what was *run* versus *reasoned through*, per the
brief's explicit instruction:

| Check | Result |
|---|---|
| `pnpm install` | **Executed.** Clean across all 13 workspace projects, including the new `@ride-it/data` dependency on the Admin app (which was initially missing — found by the next check). |
| `pnpm type-check` (`tsc --noEmit`, all 4 apps) | **Executed for real.** Found and fixed 3 genuine errors: a missing `@ride-it/data` dependency in Admin's `package.json`, and two `noUncheckedIndexedAccess` violations in `admin.ts`/`admin-users/page.tsx`. All four apps (`admin`, `passenger`, `driver`, `marketing`) now type-check with zero errors. |
| `pnpm build` | **Not executed.** Same Google Fonts network restriction in this sandbox documented in every prior phase (`fonts.googleapis.com` fails while `registry.npmjs.org` succeeds) — `next build` bundles fonts as part of webpack and fails on that alone, unrelated to any code correctness. `tsc --noEmit` was used instead specifically because it doesn't require font fetching and catches the same class of real errors. |
| `pnpm lint` | **Not executed — no ESLint config exists in this project.** This predates Phase 7; setting one up is out of this phase's scope. Stated plainly rather than skipped silently. |
| Admin app runtime boot | **Executed.** `next dev` was started directly for the Admin app; `GET /overview` returned a real `307` redirect to `/login` — confirming the existing auth middleware correctly gates the new dashboard routes end-to-end against a real (unauthenticated) HTTP request, not just static analysis. Font-fetch warnings in the log are the same known sandbox networking quirk from every prior phase, not an application error. |
| Database/migration validation against a live Supabase project | **Not executed — no live project available in this environment**, same standing caveat as every phase since Phase 3. The new migration was checked for syntax balance and correct dependency ordering (references only columns/functions that already exist), but has not been run against a real database. |

---

## 9. Any failures

None outstanding. Three real bugs were found and fixed during
type-checking (see §8) — all fixed before this document was written, none
left in the delivered code.

---

## 10. Intentionally deferred features

Stated explicitly, per the brief's own instructions (items 14–15) and
general scope discipline:

- **Real payment gateway / online payments** — "Issue partial refund" is
  visibly disabled with an explanatory tooltip rather than faked. No
  payment_method_enum value was added for "Ride It online payment" (still
  `cash`/`upi` only) — adding it without the actual payment flow behind it
  would create a selectable option that does nothing, which is worse than
  not offering it yet.
- **Driver's verified UPI as a distinct, registered attribute** — not
  modeled this phase (no schema field exists for it); flagged as a
  dedicated payment-phase concern per item 14's own framing.
- **Notification templates** — Settings screen states plainly "reserved
  for a later phase" with a disabled button, rather than a false
  affordance. No `notification_templates` table exists.
- **Nationwide city rollout system / geofencing / driver-matching by
  city** — Cities is deliberately just activation + creation, matching
  item 9's explicit "do not implement a complicated nationwide rollout
  system" instruction.
- **Restaurant/food-delivery features** — not touched, per item 15.
  Nothing in this phase's schema or query design assumes a single job
  type per driver in a way that would block adding this later (e.g.
  `wallet_transactions.reason` is already an open enum of transaction
  types, not hardcoded to ride earnings only).

---

## 11. Known limitations

- **Analytics charts bucket data client-side** (fetch raw rows, group by
  day/month in JavaScript) rather than via a database view or RPC. Fine
  at current/expected data volumes; would need revisiting if ride volume
  grows large enough that fetching raw rows for a 7-day window becomes
  expensive.
- **`getDriverDocumentSignedUrl()` requests a fresh 5-minute signed URL on
  every Driver Detail page load**, once per document. Not cached. Fine
  functionally, mildly wasteful if an admin reloads the page repeatedly.
- **Ride reassignment's candidate-driver list has no distance/ETA
  ranking** — it's every approved driver of the matching vehicle type,
  unordered. Consistent with "no driver matching/geofencing this phase."
- **The RBAC screen's non-super-admin UI gating is exactly that — UI
  gating.** Repeating this from §5 because it's the kind of thing that
  could be mistaken for a security boundary if this document isn't read:
  it isn't one. RLS is.

## 12. Recommended next phase

Two reasonable directions, not a prescription:

1. **Realtime driver matching** — the schema and `ride-requests.ts` (Phase
   6) already model "retrieve an unassigned ride" correctly; a real
   matching engine (proximity ranking, push-based offers, single-offer
   locking) is the largest remaining gap between this codebase and a real
   ride-hailing product.
2. **Payment gateway integration** — explicitly deferred across Phases 5,
   6, and 7 consistently; every screen that touches money is already
   structured to slot a real payment flow in without further architecture
   changes (subscription purchase, ride payment method, and now Admin's
   refund action all have a clearly marked seam).

---

Phase 7 complete. Not starting Phase 8.
