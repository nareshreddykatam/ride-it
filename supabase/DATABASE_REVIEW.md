# Ride It — Database Review (Phase 3)

Schema-only phase. No frontend is connected, no authentication flow is
implemented. This document explains every table, relationship, and design
decision in `supabase/migrations/`, for approval before Phase 4.

## How to read this

12 migrations, applied in order (Supabase CLI convention — numeric prefix =
apply order):

| # | File | Contents |
|---|---|---|
| 1 | `extensions_and_utility_functions` | pgcrypto, PostGIS, `set_updated_at()` trigger fn |
| 2 | `enums` | All 18 enum types |
| 3 | `lookup_tables` | cities, admin_roles, admin_permissions, admin_role_permissions, app_settings |
| 4 | `users_and_profiles` | users, passengers, drivers, admin_users |
| 5 | `vehicles_and_documents` | vehicles, driver_documents |
| 6 | `pricing_and_promotions` | pricing_rules, promo_codes |
| 7 | `subscriptions` | subscriptions, subscription_payments |
| 8 | `rides` | rides, ride_events, ratings |
| 9 | `wallets` | wallets, wallet_transactions |
| 10 | `notifications_and_support` | notifications, support_tickets |
| 11 | `auth_helper_functions` | `is_admin()`, `is_super_admin()`, `has_permission()`, etc. |
| 12 | `row_level_security` | RLS enabled + policies on every table |

Plus `supabase/seed.sql` (reference data only — cities, pricing, RBAC roles;
deliberately no fake users/rides, since no auth flow exists yet to anchor
them to real `auth.users` rows) and `supabase/config.toml` (Supabase CLI
project config).

---

## Architecture decisions that shape everything else

**1. `users` is a 1:1 profile extension of Supabase's `auth.users`, not a
replacement for it.** `auth.users` owns credentials/sessions (managed by
Supabase Auth); `public.users.id` *is* `auth.users.id`, enforced by FK. This
is the standard, recommended Supabase pattern — it means when auth is wired
up in a later phase, no schema change is needed, only the sign-up flow
needs to insert a matching `public.users` row.

**2. Role-specific tables (`passengers`, `drivers`, `admin_users`) each
extend `users` 1:1**, rather than one wide `users` table with nullable
role-specific columns. A driver's `vehicle_type NOT NULL` only makes sense
if drivers have their own table — cramming it onto a shared `users` table
would force it nullable and lose that guarantee.

**3. PostGIS `geography(Point,4326)` for all location data** (driver
`current_location`, ride `pickup_location`/`drop_location`), not plain
`numeric` lat/lng columns. The one query every ride-matching flow depends
on — "find nearby online drivers" — needs a spatial index (`GIST`) to be
fast at scale; plain lat/lng would force a full table scan or bounding-box
hacks. This is the one external-extension dependency in the schema, taken
deliberately.

**4. Soft-delete via `deleted_at timestamptz`, not hard deletes**, on every
table representing a real-world entity with history that matters (users,
rides, subscriptions, payments, documents, etc.). Financial and ride-history
integrity matters more here than reclaiming space. Tables that are pure
*ledgers* (`ride_events`, `wallet_transactions`, `subscription_payments`)
have **no** `deleted_at` at all — they're append-only by design; "deleting"
a ledger entry isn't a real operation.

**5. UUID primary keys everywhere**, generated via `gen_random_uuid()`
(pgcrypto) — never auto-increment integers. Standard Supabase practice:
avoids sequential-ID enumeration, works cleanly with `auth.users.id`, and
means IDs can be generated client-side before an insert if ever needed.

**6. Every table has `created_at`/`updated_at`**, with `updated_at`
auto-maintained by a single shared trigger function (`set_updated_at()`)
rather than relying on application code to remember to set it — attached
per-table via `trigger set_updated_at before update`.

**7. Naming convention:** tables plural snake_case (`rides`, `driver_documents`);
columns snake_case; enums suffixed `_enum` (`ride_status_enum`) to keep them
visually distinct from the columns that use them (`status`); foreign keys
named `<referenced_table_singular>_id`; indexes named
`<table>_<columns>_idx`; check constraints named `<table>_<rule>`.

---

## Table-by-table

### Identity

**`users`** — shared profile (phone, role, name, email) for every person
regardless of role. `phone` is unique with a format check matching the
existing OTP-login regex already used in the Passenger/Driver apps
(`^[6-9][0-9]{9}$`). Soft-deletable.

**`passengers`** — 1:1 extension of `users`. Rating, total ride count,
default payment method, home city. `ON DELETE RESTRICT` back to `users`
(not `CASCADE`) — a passenger with ride history can't be hard-deleted;
soft-delete via the parent `users.deleted_at` is the supported removal path.

**`drivers`** — 1:1 extension of `users`. Vehicle type, verification
status, rating, strike count (the cancellation-penalty counter from the
confirmed business rule), online status, live location (PostGIS). Same
`RESTRICT` reasoning as passengers, doubly important since subscriptions
and wallet history hang off a driver.

**`admin_users`** — 1:1 extension of `users` for the Admin dashboard.
`admin_role_id` is `RESTRICT` — deleting a role while admins hold it fails
loudly rather than silently orphaning them. `is_super_admin` bypasses
granular permission checks.

### RBAC (resolves the open gap from the earlier product audit)

**`admin_roles`** — a table, not an enum. Support/Finance/Operations Admin
(and Super Admin) are rows, not hardcoded values — new roles don't need a
migration.

**`admin_permissions`** — atomic `resource.action` codes (`drivers.approve`,
`pricing.edit`, ...), format-checked by a constraint.

**`admin_role_permissions`** — the many-to-many join between the two above.
**Not in your original table list** — added because normalizing
roles↔permissions requires it (the alternative, an array column of
permission codes on `admin_roles`, would violate normalization and make
"which roles can do X" an array-scan instead of an indexed join).

### Vehicles & documents

**`vehicles`** — separate from `drivers` so a driver's vehicle history
(replacements over time) is preserved rather than overwritten. A partial
unique index enforces exactly one `is_active` vehicle per driver at a time.

**`driver_documents`** — one *current* row per `(driver, document_type)`
(partial unique index on non-deleted rows). Re-uploads after rejection
insert a new row and soft-delete the old one, so the rejection history an
admin reviewed is never lost. `rejected` status requires a
`rejection_reason` (check constraint).

### Pricing & promotions

**`pricing_rules`** — implements the locked fare model (base fare + per-km,
no surge) exactly as already built in `packages/utils/src/fare.ts`.
`city_id NULL` = global default. A partial unique index (using
`coalesce(city_id, '00000000-...')`) ensures only one *active,
open-ended* rule per city+vehicle combination, including the global
default row.

**`promo_codes`** — standard coupon shape (flat or percentage, usage
limits, validity window). `times_used` is a denormalized counter
(documented tradeoff — see below) rather than `COUNT(*)` on every
fare-estimate call, since promo validation sits on the hot booking path.

### Subscriptions (the whole revenue model)

**`subscriptions`** — one row per subscription period. A partial unique
index guarantees at most one `status = 'active'` row per driver — this is
what "is this driver allowed to go online?" checks against, as a cheap
existence lookup rather than business logic scanning dates.

**`subscription_payments`** — split from `subscriptions` because one
subscription period can have multiple payment attempts (a retried failed
charge), and because Admin's payment-reports screen queries this directly.
`driver_id` is intentionally denormalized here for that reporting query.
No `deleted_at` — this is a financial ledger.

### Rides — the core

**`rides`** — deliberately asymmetric FK delete rules:
`passenger_id` is `RESTRICT` (ride history must survive), `driver_id` is
`SET NULL` (a ride record stays meaningful even if the driver association
is later severed). Fare integrity is enforced at the database level with a
check constraint: `total_fare = base_fare + distance_fare - discount_amount`
— no code path can write an inconsistent total, matching the locked "no
surge" fare model. A partial index on non-terminal statuses keeps Admin's
"Live Rides" screen cheap regardless of total historical ride volume.

`passenger_rating`/`driver_rating` columns on `rides` are a **documented,
deliberate denormalization** — a fast-read shortcut for ride-history lists
that avoids a join to `ratings` on every list render. `ratings` remains the
normalized source of truth.

**`ride_events`** — append-only audit log (status transitions, location
pings, admin interventions). No `updated_at`, no `deleted_at`, no update
trigger — this is what lets a dispute investigation reconstruct exactly
what happened, independent of whatever `rides.status` currently says.

**`ratings`** — normalized, one row per `(ride, direction)` — a passenger
rating their driver and a driver rating their passenger are two separate
rows, enforced unique per direction per ride (`ratings_one_per_ride_direction`).

### Wallets

**`wallets`** — modeled against `users`, not `drivers`, even though only
the Driver app currently has wallet UI — keeps the door open for passenger
wallets (refund credit, promo credit) without a schema change later.

**`wallet_transactions`** — append-only ledger. `reference_type`/
`reference_id` is a **deliberate polymorphic pointer** (points at a ride,
OR a subscription payment, OR a manual adjustment) rather than three
separate nullable FK columns. This is the one place in the schema where
referential integrity is *not* database-enforced and is instead an
application-layer responsibility — called out explicitly below.

### Notifications & support

**`notifications`** — in-app inbox records. Partial index on unread
notifications per user, since "my unread notifications" is the one query
every notification screen makes. This table is the in-app record of
notification *intent*, not the delivery mechanism (actual push/SMS
delivery is an external provider's job).

**`support_tickets`** — `user_id` and `ride_id` are both `SET NULL` (a
ticket has standalone record value even if the reporting user or related
ride is later removed; not every ticket is ride-related).

### Lookup / config

**`cities`** — service-area scoping, modeled as a table from day one
(multi-city-ready) rather than assuming single-city, since city scoping
was flagged as an open question in the product-side review.

**`app_settings`** — generic key/value config (`jsonb` value column) for
maintenance mode, supported languages, min app versions — matches exactly
what the Admin Settings screen's mock UI already displays.

---

## Index strategy

Beyond the obvious FK indexes, every index added has a specific query it
serves:

- **GIST indexes** on `drivers.current_location` (partial: online +
  approved only) and `rides.pickup_location`/`drop_location` — spatial
  nearest-driver and area queries.
- **Partial indexes** wherever a query only ever cares about a subset of
  rows: `rides_active_status_idx` (Admin's Live Rides screen never queries
  completed/cancelled rides), `subscriptions_expires_at_idx` (only active
  subscriptions matter to an expiry sweep job), `notifications_user_unread_idx`
  (unread-first is the common case).
- **Partial unique indexes** used as business-rule enforcement, not just
  performance: one active vehicle per driver, one active subscription per
  driver, one current document per type, one active pricing rule per
  city+vehicle. Each of these is a real constraint the application would
  otherwise have to re-check defensively on every write.

## Cascade / delete rules — summary

| Rule | Used for | Reasoning |
|---|---|---|
| `CASCADE` | `auth.users → users`, `drivers → vehicles/driver_documents`, most join/child tables | Child data has no independent meaning without the parent |
| `RESTRICT` | `users → passengers/drivers/admin_users`, `passengers → rides`, `admin_roles → admin_users` | Financial/history integrity — force an explicit soft-delete decision instead of silent cascade loss |
| `SET NULL` | `drivers → rides`, `cities → *`, `admin_users → driver_documents.reviewed_by` | The referencing row stays meaningful without this particular association |

## Soft-delete strategy

`deleted_at timestamptz` on entity tables (users and everything hanging off
them, cities, pricing_rules, promo_codes, subscriptions, documents,
notifications, support_tickets). **Not** present on: `ride_events`,
`wallet_transactions`, `subscription_payments` — these are immutable
ledgers where "deleting" isn't a meaningful operation; `admin_permissions`
— a fixed vocabulary maintained by migration, not runtime data.

## Row Level Security — scope and honest limitations

RLS is enabled on **every** table with baseline policies (owner
reads/writes their own data; any admin reads/writes operationally). Two
things worth flagging explicitly rather than glossing over:

1. **Fine-grained admin permissions (`has_permission()`) are built but not
   wired into policies yet.** Policies currently gate on "is this caller
   *any* admin" (`is_admin()`), not "does this admin specifically hold the
   `pricing.edit` permission." The function exists and works
   (`SECURITY DEFINER`, checks `admin_role_permissions`), but enforcing it
   per-action at the RLS layer for every table was left to the
   application/API layer for this phase — this is a scope decision, flagged
   for your review, not an oversight.
2. **Wallet and subscription-payment writes have no client-side
   INSERT/UPDATE policy at all** — by design, balances and payment records
   must only ever be written through a trusted server path (the
   `getSupabaseAdminClient()` service-role client from Phase 2, or a future
   RPC function), never directly by an authenticated passenger/driver
   session. This is intentional, not incomplete.

## Known scope boundaries (candidates for Phase 4+, not done here)

- No RPC functions/stored procedures for atomic multi-table operations
  (e.g. "insert a wallet_transaction AND update wallets.balance in one
  transaction" — currently two separate writes the application must
  sequence correctly; a `SECURITY DEFINER` RPC function is the standard fix,
  intentionally deferred).
- `wallet_transactions.reference_id` is not a real foreign key (polymorphic
  by design) — integrity there is an application-layer responsibility.
- No full-text search indexes (e.g. searching support tickets by subject) —
  not needed yet, easy to add later.
- This schema has not been executed against a live Postgres instance in
  this environment (no database/network access here) — the SQL has been
  reviewed carefully for consistency (migration ordering, FK dependency
  order, balanced parentheses) but running `supabase db reset` against a
  real project is the recommended first step before Phase 4, the same
  caveat given for every code pass so far in this project.

---

Waiting for your approval before Phase 4.
