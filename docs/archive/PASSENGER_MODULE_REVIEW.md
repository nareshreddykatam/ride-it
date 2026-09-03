# Ride It — Passenger Module Review (Phase 5)

No screen was redesigned. Every layout, spacing, color, animation, and
navigation path from before this phase is unchanged — every diff in this
phase is either a data-source swap inside an existing screen, or a wholly
new screen built for a feature that had no screen to "keep unchanged" in
the first place (same precedent as Admin Login in Phase 4).

## Architecture decision: a new `@ride-it/data` package, not `@ride-it/api-client`

`@ride-it/api-client` (from Phase 1) is REST-shaped — `fetch()` calls
against a hypothetical Node/Express backend that was never built and now
never will be, since Supabase *is* the backend (confirmed dead code in the
Phase 4.5 validation report). Building Phase 5 on top of it would mean
writing new code against an interface that doesn't do anything.

Instead: **`@ride-it/data`**, a new isolated package (same pattern as
`@ride-it/supabase`/`@ride-it/auth`) — typed Supabase query functions for
domain entities (rides, passenger profile, saved places, notifications).
It depends on nothing but `@ride-it/supabase`, and every function takes a
`SupabaseClient` as a parameter rather than constructing its own — the
same "generic over client context" pattern `db.ts`/`storage.ts`/`auth.ts`
already established in Phase 2. It's deliberately not
"passenger-specific" — rides and notifications involve drivers/admins too,
so Driver (Phase 6) and Admin (Phase 7) can extend this same package
instead of duplicating query logic per app, which is the literal ask in
your "reuse existing service layers and avoid duplicating logic"
requirement.

`@ride-it/api-client`'s dead REST stubs were left exactly as they were —
cleanup remains deferred technical debt, as you specified.

## One schema addition: `saved_places`

Not one of Phase 3's original 20 tables — "saved places" was a named Phase
5 requirement with nothing to back it. Added as
`supabase/migrations/20260805120000_saved_places.sql`: owner-only RLS
(passenger reads/writes their own only), same soft-delete/audit-column/UUID
conventions as every other table. Documented inline as additive, same as
`admin_role_permissions` was in Phase 3.

---

## Feature-by-feature

### Profile management
**Read:** `(main)/profile` now fetches the real `passengers` + joined
`users` row via `getPassengerProfile()`, replacing the hardcoded "Priya S."
— shown with a `Skeleton` (existing shared component, previously unused
outside Admin's `DataTable`) while loading.
**Write:** `updatePassengerProfile()` exists and works, but **is not
called from any screen**. The existing Profile screen has no editable
name/payment fields — adding an edit form would be new UI, which conflicts
directly with "do not redesign any screens." I chose to hold that line
rather than quietly add an edit modal. The function is ready for whenever
an edit screen is a deliberate design decision, not a data-layer one.

### Ride history
`(main)/history` now queries `listPassengerRides()` — real rows, real
fare, real status. Loading state uses `SkeletonRow` (existing component,
built in the earlier polish pass but never actually triggered by any real
async fetch until now). Empty state uses `EmptyState` (same story — built,
unused, now genuinely exercised for the first time since a new account
really does have zero ride history).

### Saved places
**New screen** (`(main)/saved-places`) — the Profile screen's "Saved
addresses" card had no `href` before this phase; it was a dead end. Wiring
it to a real destination is completing an existing but broken affordance,
not redesigning a working one. Built from only existing components:
`Card`, `Button`, `BottomSheet` (the same sheet primitive `RideRequestSheet`
already uses in the Driver app), `EmptyState`, `SkeletonRow`. Add/delete
both hit real Supabase calls (`createSavedPlace`/`deleteSavedPlace`).
Location picking uses a fixed demo coordinate — real geocoding/map
selection is explicitly excluded this phase (maps aren't in scope), stated
plainly in the code comment rather than silently faked as "real."

### Notifications
**New screen** (`(main)/notifications`) — no notifications UI existed
anywhere before. Wired to the `notifications` table that's existed since
Phase 3 (built, never queried until now). List + tap-to-mark-read, unread
indicator using the same dot pattern the design system already uses
elsewhere (e.g. online-status dots). No entry point icon was added to any
*existing* screen's header (that would be redesigning Home) — instead the
link lives as one more row in Profile's existing card-list, the same
pattern already used for Settings/Payment methods/Help.

### Booking flow → database
The core "connect the booking flow" requirement, traced end to end:

```
/booking/confirm  → createRide()        → real row in `rides`, status='requested'
/booking/matching → (unchanged 2.8s     → navigates to /ride/<real id>, not a
                     simulated delay)     hardcoded "demo-ride-id" anymore
/ride/[id]        → getRide(id)         → real OTP, fare, addresses displayed;
                                           status stepper still simulated client-side
/ride/[id]/complete → setRidePaymentMethod() → real column write, no real payment processing
/ride/[id]/rate    → ratePassengerRide()     → real row in `ratings` + rides.driver_rating
```

**What's still simulated, and exactly why:** the status stepper
(Accepted → Arriving → OTP Verified → Started) still advances on a client
`setTimeout`, and the driver name/vehicle shown is still the mock "Ramesh
K." — because real driver assignment requires matching logic, which your
Phase 5 scope explicitly excludes ("do not implement realtime driver
matching"). The ride record is real; who gets assigned to it isn't yet.
This is a real, load-bearing scope boundary, not an oversight — a ride
created this phase has `driver_id = null` forever until Phase 6+ adds
matching, which is also why `/ride/[id]/rate` checks for a driver before
writing a rating rather than erroring when there isn't one yet.

Pickup/drop coordinates use fixed demo values for the same reason maps are
excluded — `createRide()`/`createSavedPlace()` both accept real
`{lat, lng}` input and will work correctly the moment real location
picking exists; nothing about the data layer assumes fake coordinates.

### Home screen
The "Last ride" card now reflects a real most-recent ride (or disappears
entirely for a brand-new account with no history yet — the card's
`{lastRide && ...}` guard is the closest thing to a new UI decision in this
phase, and it's a conditional render of an *existing* element, not a new
one).

---

## What was deliberately not touched, and why

- **Payment methods card in Profile** — still an inert placeholder. Real
  payment processing is explicitly excluded this phase; wiring the card to
  a UPI/card-management screen with nothing behind it would be worse than
  leaving it as-is.
- **Help & support card in Profile** — not in scope, left untouched.
- **Settings screen** — already fully mock (notification toggles, default
  payment method selector) from an earlier phase; none of those toggles
  persist to `app_settings` or `passengers.default_payment_method` yet.
  Genuinely out of this phase's stated feature list (profile/history/saved
  places/notifications), so left as-is rather than scope-creeping in.
- **SOS modal** — unchanged, still explicitly placeholder copy, as it was
  before this phase.

## Fixed in passing (same category as Phase 4.5's findings)

`/booking` and `/booking/confirm` both used `useSearchParams()` without a
Suspense boundary — pre-existing debt from before Phase 4.5's validation
pass (which only checked *authentication* screens). Since this phase
required touching both files anyway, both got the same Suspense fix
applied to the auth screens last phase, rather than leaving a known-bad
pattern in place while adding new code around it.

## Remaining risks / technical debt for this module

- **`ratePassengerRide()`'s silent skip-when-no-driver is a real UX gap,
  not just a data-layer nicety.** A passenger who rates a ride today sees
  the exact same "Submitting… → Home" flow whether or not the rating
  actually saved. This is the honest consequence of matching being out of
  scope, not a bug I introduced — but it means the *rating feature is not
  actually functional end-to-end yet*, only its plumbing is. Worth
  flagging clearly before this is mistaken for "done."
- **Demo coordinates in `createRide()`/`createSavedPlace()`** mean every
  ride/saved-place created this phase has the same pickup/drop location
  regardless of what the passenger searched for. Functionally fine for
  testing the data layer; not fine for anything resembling real usage
  until maps/geocoding land.
- **No RLS testing against a live session** — same standing caveat as
  every phase. The `saved_places` policies and the existing `rides`
  policies from Phase 3 are exercised by this phase's code for the first
  time in practice (not just in migration files) — worth specifically
  confirming a passenger really can only see their own saved places and
  rides once tested against a real project.
- **`updatePassengerProfile()` and the Settings screen's toggles remain
  unwired** — flagged above, repeated here because it's the most likely
  thing to look "half-done" without this context: the data layer is ready,
  the UI decision to expose editing isn't made yet.

---

Waiting for your review before Phase 6.
