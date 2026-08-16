# Ride It — Phase 6.1 Security Hardening Review

No UI was touched — verified with a file-timestamp sweep before writing
this doc (zero `.tsx` files modified). Three `@ride-it/data` files needed
their RPC call sites updated to match hardened server signatures; every
page component that calls them kept working unchanged because those three
functions' own TypeScript signatures were deliberately left source-
compatible (unused parameters kept, just no longer forwarded to the
server).

## Vulnerabilities found

| # | Severity | Where | Issue |
|---|---|---|---|
| 1 | **High** | `rides_accept_unassigned_by_driver` (Phase 6 RLS policy) | A driver could claim any unassigned ride via a direct client UPDATE regardless of vehicle type — the `getNextAvailableRideRequest()` filter was client-side only and not a security boundary. |
| 2 | **High** | `drivers_update_own` (Phase 3 RLS policy) + Dashboard toggle | "No active subscription → can't go online" existed only in the button handler. Any direct `supabase.from('drivers').update({is_online:true})` call bypassed it entirely. |
| 3 | **High** | `purchase_subscription_simulated()` (Phase 6) | Took `amount` and `duration_days` directly from the caller with no validation — a modified client could purchase a Yearly plan for ₹1. |
| 4 | **Critical, found during the audit item you asked for, not one of your three named items** | `handle_new_auth_user()` — re-created in Phase 6 to add wallet provisioning, which is what put it in scope for "audit all Phase 6 SECURITY DEFINER functions" | Role was read from `raw_user_meta_data`, which is fully client-controlled at `signInWithOtp()` time. Anyone with the public anon key could call `supabase.auth.signInWithOtp({ phone, options: { data: { role: 'admin' } } })` directly for their own phone number and this trigger would create a `public.users` row with `role = 'admin'` for them. **This is a real, self-service privilege-escalation path to admin**, not a theoretical one. |
| 5 | Moderate | `replace_driver_document()` (Phase 6) | Accepted an arbitrary `p_file_path` with no check that it fell within the caller's own storage folder. Storage RLS blocks *uploading* to another driver's folder, but nothing stopped referencing another driver's already-uploaded file by a guessed/leaked path, exposing it through the caller's own document row. |
| 6 | Low | `increment_driver_strike(p_driver_id uuid)` (Phase 6) | Accepted a caller-supplied `driver_id`. The `WHERE id = p_driver_id AND id = auth.uid()` clause already made this functionally inert (a spoofed id just matches zero rows), but there was no reason to accept a spoofable argument the function didn't need. |
| 7 | Low (hygiene) | All four Phase 6 `SECURITY DEFINER` functions | None explicitly `REVOKE EXECUTE FROM PUBLIC` — Postgres grants `EXECUTE` to `PUBLIC` by default on function creation unless revoked, meaning the `anon` role could technically call them. In practice each function's internal `auth.uid()` checks made this non-exploitable (NULL `auth.uid()` fails a `NOT NULL` constraint or matches zero rows), but this is exactly what "appropriate execute grants" means to audit, so it's tightened regardless of whether it was currently exploitable. |

**#4 is the finding I want to be direct about**: it wasn't one of your three named items, but it falls squarely under item 4's audit instruction once you consider that Phase 6 literally re-created that function. I fixed it rather than only reporting it, because "audit all Phase 6 SECURITY DEFINER functions... no unintended privilege escalation" is exactly the criterion it fails. If you'd rather I had only reported it without touching Phase 4-originated code, say so and I'll treat future out-of-your-explicit-list findings as report-only until you decide.

## Fixes applied

**1. Ride acceptance vehicle-type enforcement** — `rides_accept_unassigned_by_driver` policy dropped entirely. New `accept_ride_request(p_ride_id)` RPC performs the same atomic conditional UPDATE as before, with `vehicle_type = driver's vehicle_type` folded into the *same* `WHERE` clause — not a separate check-then-update, so there's no window for a race between checking vehicle type and claiming the ride. Acceptance is now only possible through this function.

**2. Online status subscription enforcement** — a `BEFORE UPDATE OF is_online` trigger on `drivers`, not another RPC. Chosen specifically because a trigger protects the column regardless of *which* write path is used (the existing client call, a future RPC, or a raw REST call), where an RPC-only fix would have only closed the one path this phase happens to use. Only fires on the false/null→true transition — already-online drivers and going offline are never blocked.

**3. Subscription purchase amount/duration validation** — new `subscription_plans` reference table (four rows, seeded to match exactly what the Driver app's Subscription screen already displays) is now the source of truth. `purchase_subscription_simulated()` takes only `p_plan`; amount and duration are looked up server-side. The old 3-argument function signature was dropped, not just superseded, so it can't be called with arbitrary numbers anymore. No Admin pricing UI was built — this is a server-side reference table only, same pattern as `pricing_rules`/`cities` from Phase 3.

**4. `handle_new_auth_user()` privilege escalation closed** — phone-based (self-service OTP) signups can now only ever become `passenger` or `driver`, regardless of what `role` metadata claims. `admin` is only ever inferred for the phone-absent/email-present shape (dashboard/Admin-API-provisioned accounts, not self-service signup).

**5. `replace_driver_document()` path validation** — now requires `p_file_path` to start with the caller's own `auth.uid()` as the first path segment, rejecting otherwise.

**6. `increment_driver_strike()` simplified** — dropped the `p_driver_id` parameter entirely; only ever acts on `auth.uid()`.

**7. Execute grants tightened** — every Phase 6 function now has an explicit `REVOKE EXECUTE ... FROM PUBLIC` alongside its `GRANT ... TO authenticated`.

## Migrations added

| File | Contents |
|---|---|
| `20260807090000_harden_ride_acceptance.sql` | Drops the permissive policy, adds `accept_ride_request()` |
| `20260807090100_harden_online_status.sql` | Adds the online-status trigger + function |
| `20260807090200_harden_subscription_purchase.sql` | Adds `subscription_plans` table + RLS + seed, replaces `purchase_subscription_simulated()`, drops the old 3-arg signature |
| `20260807090300_security_definer_audit_fixes.sql` | Fixes `handle_new_auth_user()`, `replace_driver_document()`, `increment_driver_strike()`; tightens execute grants across the board |

## RLS changes

- **Dropped**: `rides_accept_unassigned_by_driver` (Phase 6) — superseded entirely by `accept_ride_request()`.
- **Added**: `subscription_plans_select_authenticated` (read active plans), `subscription_plans_all_admin` (matches the existing `pricing_rules`/`cities` pattern exactly).
- **No changes** to any Phase 3 RLS policy outside what's listed above — `drivers_update_own`, `subscriptions_select_own`, etc. are untouched (see Remaining Technical Debt for one adjacent thing I found but did not fix).

## SECURITY DEFINER functions reviewed

| Function | Auth check | Ownership scoped | Role check | search_path | Execute grant |
|---|---|---|---|---|---|
| `accept_ride_request(uuid)` | ✅ new | ✅ (`auth.uid()` only) | ✅ new (must exist in `drivers`) | ✅ | ✅ tightened |
| `enforce_driver_online_requires_subscription()` | n/a (trigger, gated by `drivers_update_own` RLS before it fires) | ✅ (`new.id`, the row being updated) | n/a | ✅ | n/a (not RPC-callable) |
| `purchase_subscription_simulated(plan)` | ✅ new | ✅ (`auth.uid()` only) | ✅ new | ✅ | ✅ tightened |
| `handle_new_auth_user()` | n/a (trigger, fires only on `auth.users` insert) | ✅ (`new.id`) | ✅ **fixed this pass** | ✅ | n/a (not RPC-callable) |
| `replace_driver_document(type, path)` | ✅ new | ✅ (`auth.uid()`) + ✅ **path validation added** | ✅ new | ✅ | ✅ tightened |
| `increment_driver_strike()` | ✅ new | ✅ (`auth.uid()` only, param removed) | — (implicit: no-op if not a driver row) | ✅ | ✅ tightened |
| `is_admin()` / `is_super_admin()` / `has_permission()` / `current_role_is()` (Phase 3) | — | — | — | — | **not re-audited this pass — see below** |

## Remaining technical debt

- **`drivers_update_own` (Phase 3) is broader than the online-status issue this pass fixed.** That policy lets a driver update *any* column on their own `drivers` row via direct REST call — not just `is_online`, but `verification_status`, `rating`, and `strike_count` too. Postgres RLS is row-level, not column-level, so this can't be fixed with a policy tweak alone; it needs either a trigger rejecting changes to protected columns, or splitting those columns into an admin-only table. **Found during this audit, not fixed** — it wasn't one of your four named items and fixing it well is a bigger change than this pass's scope, but I want it explicitly on record rather than discovered later.
- **Phase 3's own `SECURITY DEFINER` functions** (`is_admin()`, `is_super_admin()`, `has_permission()`, `current_role_is()`) were not re-audited against this pass's checklist — they predate Phase 6 and weren't in scope ("audit all *Phase 6* SECURITY DEFINER functions"). Worth the same pass eventually.
- **`handle_new_auth_user()`'s fix closes the concrete path this codebase's own code exposes, not every theoretical one.** If the Supabase project itself has email/password self-signup enabled at the project-auth-settings level (a dashboard configuration, not code), someone could self-register with an email and no phone, which this trigger would still infer as `admin` — because that shape currently means "provisioned via dashboard" *only if* self-signup is actually disabled at the project level. This is an operational/configuration requirement, not something further code can guarantee — flagging it explicitly rather than implying the code fix alone is sufficient.
- **Still true from Phase 4/6 reviews, unchanged by this pass**: no live Supabase project exists in this environment. Every atomicity and race-safety claim above (the conditional UPDATEs, the trigger firing correctly, the RPC grants actually taking effect) is reasoned through, not observed. This is doubly worth testing given this pass is specifically about security — a static review can find logic gaps but can't confirm a trigger fires correctly under real concurrent load.

---

Waiting for your review. Will not proceed to Phase 7 until this is approved.
