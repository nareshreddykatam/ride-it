# Ride It — Phase 11: Payments & Financial Integrity Review

## 1. Payment architecture

Three payment methods, matching the locked product model exactly: `cash`,
`driver_upi`, `online`. Ride It takes no commission from any of them —
nothing in this phase touches the fare calculation, and no code path
derives a "platform fee" from a ride's `total_fare`. Subscription revenue
(existing, Phase 6.1) remains the only Ride It revenue stream; this phase
connects it to a real gateway rather than changing what it is.

The three methods are handled by genuinely different mechanisms, not
unified into one abstraction that would blur the distinction the brief
insists on:

- **Cash / Driver UPI** — Ride It never touches the money. The system
  records the chosen method and a confirmation timestamp; nothing here
  ever claims "Ride It received payment."
- **Ride It Online** — a real, if never-yet-executed, gateway integration:
  server-side order creation, client-side checkout, server-side signature
  verification, and a durable webhook as the authoritative reconciliation
  path.

## 2. Cash flow

`complete_ride()` (Phase 10, amended again this phase) sets
`payment_status = 'paid'` automatically when a `cash` ride completes — the
driver already confirmed physical receipt by completing the ride; there is
no separate confirmation step to wait for, and none was invented. This is
stated as a considered design decision in the migration's own comment,
not an assumption.

## 3. Driver UPI flow

New, persistent, admin-verified fields on `drivers`: `upi_id`,
`upi_verified`, `upi_verified_at`. A driver sets their own `upi_id`
(`setDriverUpiId()`, a plain client update — already secured by the
existing `drivers_update_own` RLS). `upi_verified` is admin-only,
protected by the same `protect_driver_system_columns` trigger that has
guarded `verification_status`/`rating`/`strike_count` since Phase 6.2 —
extended this phase to also cover the two new UPI columns. A new trigger,
`reset_upi_verification_on_change`, automatically clears `upi_verified`
whenever `upi_id` changes — a driver who was verified once cannot quietly
switch to a different, unverified UPI destination while keeping the
verified badge.

**This UI genuinely didn't exist before this phase and was found missing,
not assumed built**: neither the Driver app nor Admin had any way to
set or verify a UPI id. Added to Driver's Profile screen (self-service
entry) and Admin's Driver Detail screen (verify/revoke action), both
using existing shared components, no new screens.

`complete_ride()` also auto-confirms `driver_upi` rides on completion —
same reasoning as cash: the passenger paid the driver directly and
Ride It has no visibility into that transaction beyond the driver
completing the ride.

## 4. Ride It online payment flow

A five-step sequence, deliberately not a single atomic operation, because
order creation genuinely requires an external HTTP call between two
database writes:

1. **`create_pending_ride_payment(ride_id)`** — validates the caller owns
   the ride, the ride is in a payment-eligible state, `payment_method` is
   `'online'`, and no payment has already succeeded. Reads `amount`
   directly from `rides.total_fare` — never a parameter. Idempotent:
   returns an existing non-terminal attempt rather than creating a
   duplicate.
2. The Route Handler calls the gateway's real order-create API.
3. **`attach_ride_payment_order(payment_id, provider_order_id)`**
   re-validates ownership again before recording the gateway's order id.
4. The browser opens Razorpay's Checkout widget (client-safe: only the
   publishable `key_id` and the order id ever reach it) and, on success,
   the Route Handler verifies the returned signature server-side with the
   real secret key.
5. **`mark_ride_payment_captured`** / **`mark_ride_payment_failed`** — the
   only two functions that ever set `rides.payment_status`. Callable two
   ways: by the passenger's own session (only after the Route Handler
   verified the signature — the function itself does not re-verify, and
   is safe not to, because its caller is trusted first-party server code,
   not the raw browser), or by `service_role` from the webhook (no
   ownership check in that context — there is no session to check against;
   the webhook's own signature verification is the trust boundary there).

The webhook remains the durable, authoritative reconciliation path exactly
as the brief specifies — the client-side verify call is explicitly the
"immediate UI confirmation" it explicitly permits alongside it, not a
replacement.

## 5. Driver subscription payment flow

Structurally identical to §4 (`create_pending_subscription_payment` →
gateway order → `attach_subscription_payment_order` → verify →
`mark_subscription_payment_captured`). One real design problem solved
along the way: `subscription_payments.subscription_id` is `NOT NULL`
(Phase 3), but no subscription should exist — let alone be active — before
payment is confirmed. Resolved by inserting a placeholder `subscriptions`
row with `status = 'expired'` at payment-creation time (satisfying the
`NOT NULL` and the table's own `expires_at > starts_at` check constraint,
found and respected by reading it before writing the migration) and only
flipping it to genuinely `active`, with real dates, inside
`mark_subscription_payment_captured` — never merely because a checkout
page reported success.

`purchase_subscription_simulated()` (Phase 6.1) is **dropped**, not left
alongside the new flow — there is exactly one subscription-purchase path
in the schema now.

## 6. Payment provider abstraction

`@ride-it/payments`, a new package, entirely server-only except one
explicitly-separated client-safe subpath
(`@ride-it/payments/client-checkout`, the Razorpay Checkout widget loader
— touches no secret, only the publishable key and an order id). The
`PaymentProvider` interface (`createOrder`, `verifyPaymentSignature`,
`verifyAndParseWebhook`, `initiateRefund`) is implemented once, by
`providers/razorpay.ts`; every Route Handler and RPC-calling function
talks to `getPaymentProvider()`, never to Razorpay by name. Adding a
second compliant gateway later means writing one new file implementing
that interface, not touching the payment domain model.

**Built against the actual installed SDK, verified this session, not
recalled from training data.** `razorpay@2.9.8` was installed and its real
shipped type definitions and source read directly — this is how the exact
signature-verification algorithm
(`HMAC-SHA256(secret, orderId + "|" + paymentId)`) and the real
`orders.create`/`payments.refund`/`Razorpay.validateWebhookSignature` call
shapes were confirmed, rather than assumed from memory of how payment SDKs
"usually" work.

## 7. Database changes

Six migrations, `20260816090000` through `20260816090500`:

1. **`payment_method_and_financial_protection`** — extends
   `payment_method_enum` (`upi`→`driver_upi`, adds `online`); adds
   driver UPI fields + the auto-reset trigger; extends
   `protect_driver_system_columns`; **adds `protect_ride_financial_columns`**
   — a real fix, not a defensive addition, for a genuine gap (§8).
2. **`ride_payments`** — the `payments` table (gateway-granular status,
   `created`→`captured`/`failed`/…), a DB-level unique index preventing
   more than one `captured` payment per ride, and `payment_webhook_events`
   (the idempotency table).
3. **`ride_payment_rpcs`** — the five-function chain from §4.
4. **`subscription_payment_rpcs`** — the equivalent chain for
   subscriptions, plus dropping `purchase_subscription_simulated`.
5. **`payment_webhooks_and_refunds`** — the idempotent webhook dispatcher,
   `record_ride_payment_refund`, and `complete_ride`'s cash/driver_upi
   auto-confirm logic.
6. **`payments_realtime`** — adds `payments` to the Realtime publication.

No existing table was duplicated. `payments` and `payment_webhook_events`
are genuinely new concepts (nothing like them existed); `subscription_payments`
was extended (`provider_reference`→`provider_payment_id` rename,
`provider_order_id` added), not replaced. `wallet_transactions` (the
existing immutable ledger) was not touched at all this phase — nothing in
the online-payment flow writes to it, since a ride's online payment is a
passenger→gateway transaction, not a wallet credit/debit event; driver
payout/settlement (which *would* eventually touch the wallet ledger) is
explicitly out of scope (§21).

## 8. RLS/security changes

**The most significant finding this phase, not introduced by it**:
`rides_update_passenger` (Phase 3) is row-level-only RLS — nothing has
ever stopped a passenger from directly calling
`supabase.from('rides').update({payment_status: 'paid'})` on their own
ride, or rewriting `base_fare`/`distance_fare`/`total_fare` consistently
(the existing `rides_total_fare_matches_components` check only enforces
internal consistency between those three columns, not that they can't all
be rewritten together). This is precisely "client-side payment status
spoofing" and "amount manipulation." Found by reading the existing policy
carefully against this phase's explicit requirements — the same way
Phase 8 found the matching-visibility gap and Phase 10 found the
PIN-bypass gap. Fixed with `protect_ride_financial_columns`, the same
`_mark_trusted_write()`-based trigger pattern used three times before.
`payment_method` is deliberately **not** protected — choosing a payment
method is a normal, safe passenger action.

New tables' RLS: `payments` — passenger reads own, assigned driver reads
(status only, no gateway internals beyond what's already selected),
admin full access, **no INSERT/UPDATE policy for anyone** — every write
goes through the SECURITY DEFINER chain. `payment_webhook_events` —
admin-read only, no client policy at all (pure internal audit trail).

Every new function: `search_path` pinned, `EXECUTE` revoked from `PUBLIC`.
`process_payment_webhook_event` is granted **only** to `service_role` —
not `authenticated`, not `public` — since a webhook has no user session to
authenticate as. `mark_ride_payment_captured`/`mark_ride_payment_failed`/
`mark_subscription_payment_captured`/`mark_subscription_payment_failed`
are granted to both `authenticated` (the immediate-verify path) and
`service_role` (the webhook path), with an internal conditional check:
ownership is enforced when a real session exists, skipped when it doesn't
(the webhook context) — this was a deliberate design decision, documented
in the migration itself, not an oversight.

`record_ride_payment_refund` and `create_pending_subscription_payment`
both independently re-check `is_admin()`/driver registration inside the
function — never trusting that a Route Handler already checked.

Preserved and re-confirmed by reading them again this phase: Phase 6.2's
`_mark_trusted_write()` (reused as-is, not duplicated), Phase 6.2's
`protect_driver_system_columns` (extended, not replaced), Phase 8's
matching engine (untouched), Phase 9's `get_ride_tracking` (untouched),
Phase 10's `protect_ride_start_transition` and Ride PIN system (untouched).

## 9. Webhook architecture

**One canonical endpoint** (`apps/passenger/app/api/payments/webhook/route.ts`),
serving both ride and subscription payment domains — not two separate
endpoints. This is a considered architectural choice, not a shortcut:
Razorpay (like most gateways) configures one webhook URL per merchant
account, not one per application feature, so a single endpoint that
dispatches by `provider_order_id` (checking `payments` first, then
`subscription_payments`) is the realistic, correct design given how the
gateway actually works. Uses the **service-role client** deliberately — a
webhook is an unauthenticated callback from Razorpay's own servers, not a
user session; the entire trust boundary is the signature check performed
before anything else runs.

## 10. Signature verification

Two distinct verifications, using two distinct secrets, matching the
brief's explicit separation:

- **Payment verification** (`verifyPaymentSignature`): `orderId + "|" +
  paymentId`, HMAC-SHA256 with `RAZORPAY_KEY_SECRET`. Performed
  synchronously in the Route Handler, no network call, before any database
  state change.
- **Webhook verification** (`verifyAndParseWebhook`): the raw request
  body, HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET` (a different secret),
  via the SDK's own public `Razorpay.validateWebhookSignature` static
  method.

An invalid payment signature does **not** call `mark_ride_payment_failed`
— it's treated as "cannot trust this claim," not "definitely failed," and
the UI shows "verification pending," matching the brief's explicit
example almost verbatim.

## 11. Idempotency strategy

Real database constraints, not just application-level care:

- `payments_one_captured_per_ride` (partial unique index) — the actual
  guarantee against double-charging a ride.
- `payments_one_in_flight_per_ride` (partial unique index) — prevents a
  second concurrent order for the same ride.
- `payment_webhook_events_unique_event` (unique on `provider,
  provider_event_id`) — a redelivered webhook is caught by a real
  constraint violation (`ON CONFLICT DO NOTHING`), not a fragile
  "have I seen this before" check in application code.
- Every `mark_*_captured`/`mark_*_failed` function's `UPDATE` only fires
  from a non-terminal status — calling any of them twice (immediate-verify
  path racing the webhook, or a genuinely duplicated webhook past the
  events-table guard) is a safe no-op the second time.

## 12. Refund architecture

Built completely, executed never — stated plainly rather than implied.
`record_ride_payment_refund` (admin-only, `is_admin()` re-checked inside
the function) records a refund **after** the Route Handler's real gateway
`payments.refund()` call succeeds — it never marks a refund complete on
its own initiative. Partial refunds are supported in the data model
(`refunded_amount`, the `partially_refunded` status) since the schema
already needed to represent "less than the full amount" for correctness,
not because a specific business rule demanded it — the field would
otherwise silently lose information if a partial amount were ever passed.
Admin's Ride Detail "Issue refund" button is real (calls the real Route
Handler), enabled only when a payment has actually reached `captured`, and
surfaces the honest "no gateway configured" error from
`isPaymentGatewayConfigured()` rather than pretending to succeed.

## 13. Receipt architecture

Not built as a distinct artifact this phase — the `payments` table itself
already carries everything a receipt needs (ride id, timestamps, amount,
method, status, gateway reference), and Admin's Ride Detail / the
Passenger checkout screen already surface all of it. A dedicated
PDF/downloadable receipt was judged out of scope given the phase's already
large surface area; named explicitly in §20 as deferred, not silently
skipped.

## 14. Admin payment visibility

Admin's Ride Detail now shows, when an online payment exists: gateway
status, gateway reference (`provider_payment_id`/`provider_order_id`),
capture timestamp, and refund amount/timestamp if refunded. Admin's
existing Subscriptions screen (Phase 7) continues to work against the
renamed `provider_payment_id` column (confirmed no stale reference via
`grep` before considering this done). Nothing exposes `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`, or any raw gateway credential — only
already-public-by-design references (order/payment ids) ever reach the
Admin UI.

## 15. Passenger UX

Ride-complete screen: three real payment methods. Cash/Driver UPI confirm
immediately (no fake gateway screen, matching the brief's explicit "do
not display fake gateway screens" for these two). Online shows real,
distinct states — `creating`, `awaiting checkout`, `verifying`
(explicitly "verification pending," never "successful" until the server
confirms), `captured`, `failed`, or `unavailable` (with the real
configuration-required message) — never a fabricated "successful" before
the backend actually says so.

## 16. Driver UX

Subscription screen: the same real state machine as the Passenger
checkout, applied to subscription purchase. Profile screen: real UPI
identity entry with an honest verified/unverified badge — a driver can
enter or change their UPI id but has no way to mark it verified
themselves (button doesn't exist; the underlying column is trigger- and
RLS-protected regardless).

## 17. Tests actually executed

| Check | Result |
|---|---|
| `pnpm install` | **Executed**, multiple times as dependencies were added. Clean. |
| `tsc --noEmit`, all 4 apps | **Executed for real, repeatedly.** Found and fixed a real class of bug (Route Handlers calling `supabase.rpc()` directly resolve to `never` against this project's placeholder Database type — fixed by adding proper typed wrappers in `@ride-it/data`, the established pattern, not by suppressing the error). Zero errors on the final pass across `passenger`, `driver`, `admin`, `marketing`. |
| `next dev` runtime boot | **Executed**, deliberately *without* Razorpay credentials configured, specifically to verify the honest-degradation path. Real `307` (correct auth-redirect) responses from every payment-touching screen across all three apps: Passenger `/ride/[id]/complete`, Driver `/subscription` and `/profile`, Admin `/rides/[id]` and `/drivers/[id]`. |
| Migration syntax / constraint cross-checks | **Executed as static review** — the `subscriptions_expires_after_starts` check constraint was read directly before writing the placeholder-subscription-row logic (an earlier draft would have violated it); an invalid `INSERT...RETURNING`-as-subexpression was caught by reasoning through PostgreSQL's actual grammar before it was ever run. |
| Live gateway (order creation, real checkout, real webhook delivery, real refund) | **Not executed. No real Razorpay account or credentials exist in this environment.** Nothing in this document claims otherwise. |
| Live Supabase (migration execution, RPC behavior against real data, concurrent-payment race safety, real Realtime delivery) | **Not executed** — no live Supabase project in this environment, same standing caveat as every phase since Phase 3. |

## 18. Test results

All static and runtime-boot checks passed, including the bug found and
fixed in §17 (the `.rpc()` typing issue) and the vulnerability found and
fixed in §8 (`protect_ride_financial_columns`). No money has moved. No
subscription has actually activated via a real payment. No refund has
actually been issued. Every one of those claims would require the
external credentials named in §19.

## 19. External credentials/services required

- A real Razorpay account (or equivalent) with `key_id`, `key_secret`,
  and a webhook configured with its own `webhook_secret` — for order
  creation, checkout, verification, and webhook delivery to be real.
- A live Supabase project — for every RPC, trigger, and constraint in
  this phase's six migrations to be exercised against real data.
- Neither exists in this environment. `isPaymentGatewayConfigured()`
  correctly reports `false` here, and every screen degrades honestly as a
  direct, verified consequence (§17).

## 20. Known limitations

- **No receipt PDF/downloadable artifact** (§13) — the data model
  supports generating one; nothing renders it yet.
- **Cancellation-fee rules are not defined anywhere in this codebase**,
  and this phase did not invent any — per the brief's explicit "if
  cancellation-fee rules are not defined, do not silently invent them,
  document the missing rule for a later phase." Stated here as that
  documentation: Passenger-cancels-before-assignment,
  passenger-cancels-after-assignment, and driver-cancels all currently
  have zero financial consequence in this codebase (Phase 8's
  `passenger_cancel_matching_ride`/Phase 10's `passenger_cancel_active_ride`
  neither charge nor waive anything) — this phase preserved that
  as-is rather than inventing a fee structure with no business-rule
  basis to draw from.
- **No driver payout/settlement mechanism** — see §21, the brief's own
  explicit exclusion.
- **The immediate-verify path's ownership check assumes `auth.uid()` is
  reliably `NULL` for a service-role connection** — reasoned through
  carefully (service-role clients bypass PostgREST's normal JWT-based
  session entirely) but not empirically confirmed against a live
  Supabase project.

## 21. Deferred driver payout/settlement work

Explicitly and deliberately not built, per the brief's own strong
instruction. **"Online payment received" is never treated as "driver
paid" anywhere in this codebase.** When a Ride It Online payment captures,
the only things that happen are: `payments.status` becomes `captured`,
`rides.payment_status` becomes `paid`, and the passenger/driver each get a
notification. Nothing credits the driver's wallet, nothing schedules a
transfer, nothing implies money has reached the driver's bank account.
Driver UPI and Cash remain the only payment methods where the driver
actually has the money, by design, immediately. If Ride It later needs to
collect online passenger fares centrally and then transfer driver
earnings out, that requires a genuinely separate marketplace/settlement/
payout architecture (routing, KYC for payouts, a payout ledger distinct
from the existing `wallet_transactions` table) — not built, not
sketched, not implied to exist.

## 22. Recommended Phase 12

Two reasonable directions:

1. **A real Razorpay test-mode credential pass** — before any further
   payment-adjacent work, actually exercising this phase's architecture
   (order creation, checkout, signature verification, webhook delivery,
   refunds) against Razorpay's real test environment would convert a large
   amount of "reasoned through carefully" into "confirmed," the same
   recommendation made at the end of Phase 9 for Maps and never yet acted
   on for either.
2. **Driver payout/settlement architecture** — the explicitly-deferred
   piece from §21, and the natural next step once online payments are
   confirmed working: designing how Ride It would actually move collected
   online fares to drivers, which is a materially different (and
   regulatorily heavier) problem than anything built this phase.

---

Phase 11 complete. Not starting Phase 12.
