# Ride It — Driver Module Review (Phase 6)

No screen was redesigned. Every diff this phase is either a data-source
swap inside an existing Driver screen, or a scoped disable/removal of a
control that can't honestly do anything yet (the Wallet screen's Withdraw
button — see below). No new screens were added this phase, unlike Phase 5.

## Schema/RLS changes — more than Phase 5, and why

Phase 6 needed six new migrations, more than any phase since the original
schema design. Worth walking through, because several are direct
consequences of Phase 3's own deliberate security decisions colliding with
features Phase 6 needed to actually work — not architecture drift, but the
expected cost of "lock things down by default" meeting "now build the
feature that needs an exception."

| Migration | Why |
|---|---|
| `driver_documents_storage` | The `driver-documents` bucket never actually existed — Phase 2 built the storage *helper functions* expecting it, but nothing had created it yet. Added the bucket + path-scoped storage RLS (`driver-documents/<driver_id>/...`). |
| `ride_acceptance_rls` | **Real gap found while implementing acceptance.** Phase 3's `rides_update_driver` policy only covers rides *already* assigned to the calling driver (`driver_id = auth.uid()`). Claiming a new ride means `driver_id` goes from `null` to `auth.uid()` — that transition was never covered by any policy, so every accept would have been silently rejected by RLS. Added a second, narrower policy specifically for that transition. |
| `increment_driver_strike_function` | The confirmed driver-cancellation-strike business rule (from the original product phase) needs an atomic increment. A plain client update can't do `strike_count = strike_count + 1` safely under concurrent cancellations — added a narrow `SECURITY DEFINER` RPC, scoped to `id = auth.uid()` only. |
| `purchase_subscription_function` | **Direct collision with an explicit, approved Phase 3 decision:** subscriptions/subscription_payments have no client-writable INSERT policy on purpose ("payment-provider webhooks and subscription issuance should never be client-writable directly"). Rather than add a broad policy to make this phase easier, added a narrow RPC that can only ever write a subscription for `auth.uid()`, preserving the original intent while making "subscribe" actually work. |
| `replace_driver_document_function` | Same pattern again — Phase 3 gave drivers *no* UPDATE policy on `driver_documents` at all ("only admins review documents"). Re-uploading needs to soft-delete the old row first (a unique index requires it) — added a narrow RPC that can only retire the caller's own document, not touch `status`/`rejection_reason`/`reviewed_by`. |
| `provision_driver_wallet` | Extended the existing Phase 4 trigger (not a new one) so new drivers get a zero-balance wallet automatically — nothing did this before, and the Wallet screen would have had no row to read otherwise. |

The pattern across four of these: **when a feature needed a write that
Phase 3 deliberately hadn't allowed, the fix was always a narrowly-scoped
`SECURITY DEFINER` RPC function that can only act on the caller's own
data** — never a broadened general policy. This is the same shape as
`increment_driver_strike`, chosen consistently rather than reaching for a
quick blanket policy each time.

## Architecture: extended `@ride-it/data`, added nothing new

No new package this phase — `@ride-it/data` (from Phase 5) gained five
modules (`drivers.ts`, `documents.ts`, `earnings.ts`, `wallet.ts`,
`ride-requests.ts`), all following the same pattern already established:
plain functions taking a `SupabaseClient` parameter, no app-specific
assumptions. `rides.ts` (Phase 5) gained driver-side lifecycle functions
(`markDriverArriving`, `verifyRideOtp`, `startRide`, `completeRide`,
`cancelRideByDriver`) rather than a duplicate ride-writing module — the
same file that already owned ride writes for the Passenger app now owns
them for the Driver app too, which is the literal "reuse service layers,
avoid duplicating business logic" instruction.

---

## Feature-by-feature

### Document upload (Supabase Storage)
Real. `documents/page.tsx` now uploads to the private `driver-documents`
bucket and calls `replace_driver_document()`. Status pills (Pending/
Approved/Rejected/Not uploaded) reflect real `driver_documents` rows. **One
real behavior change, not hidden**: the "Continue" button used to always
work (a demo bypass). It now requires all five documents to actually be
`approved` — which requires an admin to review them (Phase 7). Until then,
this screen is a genuine dead end for a freshly-signed-up driver, which is
correct/expected, not a bug, but worth knowing before assuming the
Driver→Dashboard flow is click-through end to end right now.

### Driver profile
Real. Name/phone/vehicle type/verification status/rating from `drivers` +
joined `users`, replacing "Ramesh K." Loading state uses `Skeleton`.

### Subscription status
Real subscription record via the `purchase_subscription_simulated()` RPC —
**no real payment gateway**, exactly as scoped. Dashboard shows the real
plan name and real days-until-expiry. Plan pricing itself is still a fixed
list in the Subscription screen (not read from the `pricing_rules` table
Phase 3 built) — that table has no admin-editable UI wired to it yet;
connecting the two is Phase 7 (Admin Module) territory, not Driver.

### Online/offline state
Real — writes `drivers.is_online`. The toggle is disabled (can't go
online) when there's no active subscription, matching the original PRD
rule. Enforcing that rule at the database level too (not just the UI) is
flagged as debt, not built this phase.

### Earnings
Real — always derived from `rides` (sum of `total_fare` for this driver's
completed rides in the selected range), never a stored running total.
Empty/loading states use the shared `EmptyState`/`SkeletonRow` components.

### Wallet
Real balance and real transaction history (both read-only, per Phase 3's
deliberate service-role-only write design for `wallets`/
`wallet_transactions`). **The Withdraw button is now permanently disabled**
rather than showing a fake "Processing…" state — it used to simulate
success, which Phase 6 made dishonest now that the rest of the screen is
real. A real withdrawal needs a trusted server-side flow (a future Edge
Function or RPC), explicitly out of this phase's "no payment gateways"
scope. This is a deliberate downgrade in apparent functionality in
exchange for not lying about what works.

### Ride request retrieval
**Genuinely real retrieval**, not mock data — `getNextAvailableRideRequest()`
queries actual `rides` rows created by the Passenger app's Phase 5 booking
flow (`status = 'requested'`, `driver_id is null`, matching vehicle type).
This is the most consequential design decision this phase: it means Phase
5 and Phase 6 are now genuinely connected — a real passenger booking shows
up as a real driver's ride request. What's still simulated, precisely:
*when* a driver's app checks (a fixed delay after going online, not a
push/realtime subscription) and *which* driver gets first look (whoever's
app happens to poll first) — there's no proximity ranking or broadcast
arbitration. That's the actual matching engine, correctly deferred.

### Ride acceptance and rejection
**Acceptance is real and race-safe**: `acceptRideRequest()` is a single
conditional `UPDATE ... WHERE status='requested' AND driver_id IS NULL`,
not a read-then-write — if two drivers' apps both tried to claim the same
ride, only one UPDATE actually matches a row; the second driver's app gets
`null` back and the request just disappears for them, which the Dashboard
handles without erroring. **Rejection is intentionally a no-op** — there's
no per-driver "offer" record to decline (that requires the same matching
engine mentioned above), so dismissing just closes the sheet locally.
Documented plainly in `ride-requests.ts` rather than left implicit.

### Navigation → OTP → completion
Wired end to end against the real ride: `verifyRideOtp()` checks the
entered code against the ride's actual stored OTP as a single conditional
UPDATE (same atomic-check pattern as acceptance, not a separate fetch-and-
compare), `startRide()`/`completeRide()` write real status transitions and
timestamps. The passenger's name is shown as a generic "Your passenger"
rather than a fake specific name — no driver-facing passenger-name lookup
exists yet, and I chose not to invent one just to fill that line; flagged
here rather than fetching a name via a new join function that wasn't asked
for.

---

## What was deliberately not touched, and why

- **Pricing/plan amounts** — still hardcoded in the Subscription screen,
  not read from `pricing_rules`. Genuinely Admin Module territory (Phase 7).
- **Vehicle registration/management** — Phase 6's task list didn't include
  it; `vehicles` table exists from Phase 3 but nothing in the Driver app
  reads or writes it yet.
- **Push notifications for ride requests** — the Dashboard still polls on a
  timer rather than subscribing to anything realtime, consistent with
  "do not implement realtime driver matching yet."

## Remaining risks / technical debt

- **The "no active subscription = can't go online" rule is UI-only.**
  Nothing stops a direct API call from setting `is_online = true` without
  an active subscription — the check lives in the Dashboard's button
  handler, not a database constraint or trigger. Worth hardening before
  this matters for real money.
- **Ride-request retrieval has no locking/visibility window.** A ride
  sitting unclaimed for a long time is just as "available" as one created
  a second ago — there's no expiry, no re-broadcast, no driver-side radius
  filtering. Fine for proving the data layer works; not a matching engine.
- **`getDriverProfile`/`getPassengerProfile` (Phase 5) both hand-roll the
  same "PostgREST joined-row might come back as an array" normalization
  logic independently.** Small duplication, flagged rather than fixed —
  extracting a shared helper is a reasonable Phase 7 cleanup, not urgent.
- **Same standing caveat as every phase**: none of this has been executed
  against a live Supabase project. The RLS/RPC interactions in particular
  (four new narrowly-scoped functions this phase alone) are exactly the
  kind of thing that should be verified with real concurrent requests
  before trusting the race-safety claims above as more than "reasoned
  through correctly."

---

Waiting for your review before Phase 7.
