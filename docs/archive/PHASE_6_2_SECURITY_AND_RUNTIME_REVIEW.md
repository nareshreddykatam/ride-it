# Ride It — Phase 6.2 Security & Runtime Review

## A note on this pass being different from every prior one

Every review document in this project up to now has included some version
of "no network access in this environment, everything below is reasoned
through, not executed." **That changed this session.** This environment had
real network access, so this pass includes something none of the prior six
phases could: an actual `pnpm install` (the first ever, across the whole
project's history), real `tsc` type-checking of all four apps, and a real
`pnpm dev` boot. That surfaced genuine bugs that had been sitting
undetected across multiple phases — not hypothetical ones. Details below,
disclosed in full rather than glossed over because they weren't on your
list.

**Also disclosed plainly**: partway through this session the sandbox
container itself reset (`/home/claude/ride-it` briefly stopped existing).
The project was recovered from the last delivered zip on a separate
persisted mount and diffed against what had been reviewed just before the
reset — confirmed identical before continuing. Mentioned here because it's
exactly the kind of infrastructure hiccup that should be disclosed, not
quietly worked around.

---

## 1. Driver self-update privilege — fixed

Your rejection of "technical debt" framing was correct. Implemented
exactly as you specified: a trigger, not a narrower RLS policy (RLS cannot
express column-level restriction on its own — `drivers_update_own` stays
row-level, `id = auth.uid()`, unchanged).

**`protect_driver_system_columns()`** (`BEFORE UPDATE ON drivers`) blocks
changes to `verification_status`, `rating`, `strike_count`, `total_rides`
unless the write is either from a real admin session (`is_admin()`) or
explicitly marked as a trusted system write. `is_online` is deliberately
**not** in this list — it remains driver-editable, still gated only by
Phase 6.1's `enforce_driver_online_requires_subscription` trigger, per your
explicit instruction to leave that mechanism alone.

**The "trusted system write" mechanism**: a new `_mark_trusted_write()`
function sets a transaction-local flag (`set_config(..., true)` — local to
the current transaction only, so it can't leak across separate REST calls
even if a client somehow reached it, which it can't — zero `EXECUTE` grant
to `authenticated`/`anon`). `increment_driver_strike()` was updated to call
it before touching `strike_count`, since that's the one existing case where
a driver's own non-admin session legitimately needs to modify a normally-
protected column through an audited path.

`vehicle_type`, `current_city_id`, `current_location`, `location_updated_at`
remain driver-editable — none are "admin/system-controlled" in the sense
you meant (a driver plausibly does update their own vehicle or location).

## 2. Admin role provisioning — fixed properly this time

Your rejection here was also correct, and I want to be direct about it:
Phase 6.1's "email present + phone absent = admin" fix reduced the
concrete escalation path but was still an inference from signup *shape*,
not real authorization — it assumed a configuration fact about the
Supabase project (that self-service email signup is disabled) rather than
enforcing anything in code.

**`handle_new_auth_user()` no longer infers `admin` under any
circumstance, for any signup shape or metadata, ever.** Every self-service
account — phone OTP or email/password, any `user_metadata` — defaults to
`passenger` unless `driver` is explicitly requested (which remains safe:
driver isn't privileged relative to passenger).

**The trusted mechanism, documented exactly** (also in the migration's own
comment, not just here):
1. A trusted operator, using the **service-role key** (`getSupabaseAdminClient()`
   from `@ride-it/supabase`, in a secure backend/ops context — never the
   anon key, never a browser session), creates the `auth.users` row.
2. `handle_new_auth_user()` fires automatically, creating a `passengers`-
   role `public.users` row — the same safe default every signup gets.
3. The same operator calls **`provision_admin_user(user_id, admin_role_id,
   is_super_admin)`** using the service-role client. This is the actual
   enforcement point: `EXECUTE` is granted **only to `service_role`** —
   not `authenticated`, not `anon`. No client-controlled signup metadata
   can reach this function at all, regardless of what it contains. It
   atomically flips the role to `admin`, removes the passenger row from
   step 2, and creates the `admin_users` row.

No app code was built for step 3 (no UI, no TS wrapper) — deliberately,
since Admin functionality remains out of scope and this is meant to be run
by a trusted human operator directly, not exposed through the product.

## 3. Turbo 2 compatibility — fixed and genuinely verified

`turbo.json`'s `"pipeline"` key renamed to `"tasks"`, task configuration
otherwise byte-identical. **This was actually run, not just edited**:
`pnpm install` succeeded cleanly across all 13 workspace projects (first
real install this project has ever had), Turbo resolved to `2.10.9`, and
`pnpm dev` started all four Next.js apps with zero configuration errors —
Marketing served a real `200` response; Passenger's middleware compiled
and correctly threw the expected "Missing environment variable
NEXT_PUBLIC_SUPABASE_URL" error (the fail-closed behavior documented back
in Phase 4.5 — this is confirmation it works as designed, not a bug).

## 4. Phase 3 SECURITY DEFINER function audit — completed

`is_admin()`, `is_super_admin()`, `has_permission()`, `current_role_is()`
(plus `is_driver()`/`is_passenger()`, which wrap `current_role_is()`),
reviewed against every criterion you listed:

- **Auth requirement**: each reads `auth.uid()` directly from the verified
  JWT — not a parameter, nothing to spoof.
- **Ownership / role logic**: pure reads (`EXISTS`/`SELECT`) scoped to
  `auth.uid()`. No write capability at all, so "no ability to modify
  another user's data" is trivially true.
- **`search_path`**: already pinned since Phase 3. No change needed.
- **Input manipulation**: `has_permission(permission_code text)` is the
  only one with a parameter — used solely in an equality comparison inside
  a JOIN, never concatenated into dynamic SQL. No injection surface, and a
  malicious value can only make the check *false*, never forge a *true*
  result. Confirmed (again) not called from any application code yet.
- **Privilege escalation**: none found. None of the four can grant or
  forge admin status — they only report on state that only
  `provision_admin_user()` can set.

**One real finding**: none had explicit `EXECUTE` grants — Postgres grants
`EXECUTE` to `PUBLIC` by default unless revoked, so `anon` has technically
had implicit access to all four since Phase 3. Not exploitable (each
predicate is scoped to `auth.uid()`, which is `NULL` for `anon`, making
every check trivially false) — but tightened anyway, since this is
precisely what "appropriate execute grants" means to audit. `REVOKE ...
FROM PUBLIC` + `GRANT ... TO authenticated` on all four (not zero grant —
these are called from inside RLS policies evaluated on behalf of
`authenticated` throughout the schema; revoking without re-granting would
have broken most of the RLS in this database).

---

## Unplanned but real: dependency and type bugs found via actual compilation

Not part of your four items, surfaced by actually running `pnpm install` +
`tsc` for the first time in this project's history. Fixed because they're
genuine compile errors, not judgment calls:

| Bug | Root cause | Fix |
|---|---|---|
| `Cannot find module '@supabase/supabase-js'` in `@ride-it/auth` and `@ride-it/data` | Both packages import its types directly in every file but never declared it as a dependency — only `@ride-it/supabase` (which itself depends on it) was listed | Added `@supabase/supabase-js` as an explicit dependency to both `package.json`s |
| `SupabaseClient<Database, "public", {...}>` not assignable to `SupabaseClient<any, "public", "public", any, any>` across `client.ts`/`server.ts`/`middleware.ts` | `@supabase/ssr` was constrained to `^0.4.0`, which resolved to a stale `0.4.1` — built against an older `@supabase/supabase-js` generic shape than the `2.112.2` that `^2.44.0` now resolves to. Real version skew, invisible until actually installed | Bumped the constraint to `^0.12.0` (current), and changed the return-type annotations from a manually-restated `SupabaseClient<Database>` to `ReturnType<typeof createBrowserClient<Database>>` (and the server/middleware equivalents) so the type always matches whatever the installed `@supabase/ssr` actually returns, regardless of future drift |
| `Property 'x' does not exist on type 'never'` in `context.tsx` and `middleware.ts` | Both cast individual properties (`data.id as string`) rather than the whole row — real `tsc` rejects a per-property cast when the base object's inferred type is `never` (which the placeholder `Database` type produces). My earlier assumption that "property access on `never` always compiles" was simply wrong | Cast the whole row once (`data as unknown as {...}`) before destructuring — matches the pattern already correctly used everywhere in `@ride-it/data` |
| `Cannot find name 'UpdateRidePaymentInput'` in `rides.ts` | The interface declaration was lost during an earlier `str_replace` edit in Phase 6 and never caught until real compilation | Restored it |
| `Object is possibly 'undefined'` in `apps/passenger/app/ride/[id]/page.tsx` | `STEPS[stepIndex].label` — the base `tsconfig` has had `noUncheckedIndexedAccess: true` since Phase 1, but nothing had ever actually been compiled against it until now | `STEPS[stepIndex]?.label ?? "In progress"` — `stepIndex` is always in bounds in practice, so this changes no real behavior, only satisfies the type checker |

**On the one `.tsx` file this touched** (`apps/passenger/app/ride/[id]/page.tsx`):
your instruction was zero UI redesign, and I want to be precise rather than
just claim compliance. This is a one-line array-access safety fix with no
visual, layout, or behavioral change under any real usage — `stepIndex`
never goes out of `STEPS`' bounds in the actual flow. I judged this as
"fixing a real compile error the same way the Suspense-boundary fixes in
Phase 4.5/5/6 were," not as UI redesign, but I'm flagging it explicitly
rather than letting "zero `.tsx` files changed" be an inaccurate claim. One
other `.tsx` file changed, inside a package not an app:
`packages/auth/src/context.tsx` (the `never`-cast fix above) — also
logic-only, zero visual surface.

**Result: all four apps (`passenger`, `driver`, `admin`, `marketing`) now
type-check with real `tsc`, zero errors.** This is the first time that's
been true in this project's history.

---

## Migrations added this phase

| File | Contents |
|---|---|
| `20260808090000_protect_driver_system_columns.sql` | `_mark_trusted_write()`, `protect_driver_system_columns()` trigger, updated `increment_driver_strike()` |
| `20260808090100_fix_admin_provisioning.sql` | Rewrote `handle_new_auth_user()` (no admin inference, ever), added `provision_admin_user()` |
| `20260808090200_audit_phase3_security_functions.sql` | Tightened execute grants on the four Phase 3 helper functions |

## RLS / security-model changes summary

- **No RLS policies changed this phase** (item 1 used a trigger specifically
  *because* RLS can't express this; item 2's fix lives entirely in trigger
  logic + a new function's grants).
- **New `service_role`-only function**: `provision_admin_user()` — the
  first function in this schema restricted to `service_role` rather than
  `authenticated`.
- **New internal-only function**: `_mark_trusted_write()` — granted to no
  client-facing role at all.
- **Execute grants tightened** on 4 Phase 3 functions + all Phase 6/6.1
  functions now consistently follow the same `REVOKE FROM PUBLIC` + explicit
  `GRANT` pattern.

## Migration ordering — verified

All 27 migrations listed in timestamp order; each new function `CREATE OR
REPLACE`s the correct prior version (`handle_new_auth_user` has now been
replaced three times — Phase 4 → 4.5 → 6.1 → 6.2 — each building on the
last, confirmed no orphaned duplicate signatures). No forward-references;
every object a new migration touches was created in an earlier one.

## Backward compatibility with existing Phase 6 functionality

Checked every `@ride-it/data` call site against the new function
signatures — **zero app-layer files needed to change** for any of this
phase's security fixes (the one `.tsx` fix above is unrelated, a
compile-error fix). `acceptRideRequest()`, `purchaseSubscription()`, and
`cancelRideByDriver()` all kept their existing TypeScript signatures,
internally calling the hardened server functions — the Driver Dashboard,
Subscription screen, and Navigation screen's existing code work unchanged.

---

## Remaining limitations — runtime tests that still require a real Supabase project

Real `tsc`/`pnpm dev` verification is a genuine step up from every prior
phase, but it is **not** a substitute for testing against a live database.
Specifically still unverified and requiring a real project:

- **The `protect_driver_system_columns` trigger's actual behavior** —
  that it correctly blocks a direct client update to `verification_status`
  while correctly allowing `increment_driver_strike()`'s trusted write.
  Reasoned through carefully; not observed.
- **`provision_admin_user()`'s end-to-end sequence** — creating a real
  auth user via the Admin API, confirming the default-passenger row
  appears, then confirming the promotion function correctly cleans it up
  and creates the admin row.
- **Concurrent-request race safety** for `accept_ride_request()` — the
  atomic conditional `UPDATE` is correct on paper; only real concurrent
  requests against a live database prove it.
- **RLS policy behavior under real authenticated sessions** — every
  policy in this schema has been reviewed statically; none have been
  exercised against a real JWT.

**Runtime environment note for next time**: this session had real network
access where none of the prior six phases did. If that's consistently
available going forward, I'd recommend treating "run it for real" as the
default next step for future phases rather than static review — this
session alone found 5 real bugs no amount of careful reading had caught
across six prior phases.

---

Waiting for your review. Will not proceed to Phase 7 until this is approved.
