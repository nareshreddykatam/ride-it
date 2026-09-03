# PHASE 18 FINAL REPORT

## 1. Objective

Reconcile the repository's migration history with the real hosted
Supabase project, determine the true root cause and scope of the
table-privilege gap Phase 17 found for `admin_users`, and — only once
that root cause was established with direct evidence — propose and
locally verify the smallest correct fix, without weakening RLS anywhere.

## 2. Repository state

61 migrations were present at the start of this phase. The migration
referenced as already applied to the hosted project
(`20260820090100_grant_admin_users_select.sql`) was confirmed absent
from the repository — a genuine desynchronization between stated hosted
reality and the repository's own source-of-truth claim.

## 3. Hosted Supabase state

Established entirely from the evidence you provided (this sandbox has no
network access to the real project — unchanged since Phase 14):

- Remote migration history synchronized through `20260820090100`.
- `has_table_privilege('authenticated', 'public.<table>', ...)` returns
  `false` for `SELECT`/`INSERT`/`UPDATE`/`DELETE` on almost every table.
  `admin_users` was the sole exception (the Phase 17 fix).
- Same check for `anon`: `false` across all listed tables.
- `pg_default_acl` shows a default-privilege rule exists, scoped to
  `defaclrole = supabase_admin`.

## 4. Migration synchronization

**Restored**: `20260820090100_grant_admin_users_select.sql`, with the
exact content already applied (`grant select on table public.admin_users
to authenticated;`). This is not a new change — the repository is
catching up to what is already true on the hosted project. No existing
migration was modified; no timestamp was changed; nothing was inserted
into the middle of history.

## 5. Table privilege analysis

Confirmed by full-chain search: zero migrations across all 61
pre-existing files ever issue a table-level `GRANT` to `authenticated`
or `anon` for any table (only RPC `EXECUTE` grants exist, which are a
separate privilege system). Every table's access has relied entirely on
RLS, on an implicit, never-verified assumption that some baseline table
privilege already existed.

## 6. Default privilege analysis — root cause, established not guessed

Your `pg_default_acl` result is decisive: `defaclrole = supabase_admin`.
Postgres's `ALTER DEFAULT PRIVILEGES` is always scoped to the *creating*
role. Supabase's platform sets this rule up for `supabase_admin`
specifically — the role Studio-based table creation uses internally.
`supabase db push` creates tables as the `postgres` role instead, a
different role than the one the default-privilege rule covers, so the
rule never applies to any table this project has created via migration.
This is a structural consequence of using CLI migrations against a
Supabase project, not a Ride It design flaw and not something detectable
without hosted access — which is exactly why it surfaced now rather than
in any of the sixteen prior phases.

**Severity, established precisely, not assumed**: `SECURITY DEFINER`
functions (the majority of this project's sensitive writes — matching,
Ride PIN, payments, ratings, safety) execute with the privileges of
their *owner* (`postgres`), not the calling role, per Postgres's own
`SECURITY DEFINER` semantics — they are entirely unaffected by this gap.
Only direct `.from('table').select()/.insert()/.update()` calls from the
frontend are affected — which is nonetheless the majority of this
project's *read* paths.

## 7. RLS analysis

No RLS policy was found to be incorrect, and none was modified. Every
granular policy you listed (`rides_select_passenger`,
`drivers_select_active_ride_passenger`, `saved_places_select_own`, etc.)
remains exactly as it was. This phase's fix operates entirely at the
layer *beneath* RLS.

## 8. Security analysis

Verified directly, locally, before proposing anything (full transcript
in §14): granting `authenticated` a baseline table privilege does not
bypass or weaken RLS anywhere. Reproduced concretely — after applying
the proposed grant, an authenticated passenger reading an *unrelated*
passenger's ride still receives zero rows (not an error); a non-admin
authenticated session reading `admin_users` still receives zero rows
even though the table privilege now exists; the exact same financial-column
protection trigger from Phase 11 still fires with its identical error
message. `anon` was deliberately left with no table grant — verified
that no RLS policy anywhere would ever make use of one, since the
project's one deliberate anon-facing surface
(`get_shared_ride_info`, Phase 13) is an RPC with its own separate
`EXECUTE` grant, untouched by this change.

## 9. Root cause

Stated once, precisely: Supabase's default-privilege rule for the
`public` schema is scoped to the `supabase_admin` role; this project's
tables are created by `postgres` via CLI migrations; the rule therefore
never applies. Confirmed with direct hosted evidence (`pg_default_acl`,
`has_table_privilege`), not inferred from a single query, and reproduced
locally by deliberately building a database without the grant and
observing the identical `permission denied for table <name>` error class
Phase 17 found.

## 10. Exact fix

Two migrations, in order after the latest applied hosted migration:

1. `20260820090100_grant_admin_users_select.sql` — **restored**, not
   new; exact content already live on the hosted project.
2. `20260820090200_grant_baseline_table_privileges.sql` — **new**:
   ```sql
   grant select, insert, update, delete on all tables in schema public to authenticated;

   alter default privileges for role postgres in schema public
     grant select, insert, update, delete on tables to authenticated;
   ```
   The first statement fixes every *existing* table. The second — scoped
   correctly to `FOR ROLE postgres`, matching the role that actually
   creates tables via migrations — prevents this exact gap from
   recurring for any *future* table a later migration creates. `anon`
   receives nothing, deliberately (§8).

## 11. Files changed

- `supabase/migrations/20260820090100_grant_admin_users_select.sql` (restored)
- `supabase/migrations/20260820090200_grant_baseline_table_privileges.sql` (new)

No application code, RLS policy, or existing migration was modified.

## 12. Migrations created/restored

Both listed in §11. Neither duplicates the other — the first grants
`SELECT` on one table (matching exactly what's already live); the second
grants the fuller baseline on all tables and is additive, not repeating
the first's logical change (confirmed: re-granting `SELECT` on
`admin_users` a second time via the broader statement is a harmless
no-op in Postgres, not an error or a conflict).

## 13. Hosted migrations pushed

**None. I cannot push to the hosted project from this sandbox** — no
network access, no access token, consistent with every prior phase.
Both migrations are prepared and locally verified, awaiting your
`db push` from the Windows environment. Exact commands in §21.

## 14. Tests executed

**LOCAL TEST**, all of the following, against a database deliberately
built *without* any table grant (replicating the real hosted gap, not
using my earlier Phase 12 shim's broad-grant assumption):

1. Applied the full 61-migration chain fresh: clean, zero errors.
2. Reproduced the exact hosted symptom: authenticated passenger reading
   their own `rides` row -> `permission denied for table rides` —
   matching Phase 17's `admin_users` finding, now confirmed systemic.
3. Applied the proposed fix migration.
4. Re-ran the same read: succeeded, real row returned.
5. Confirmed RLS still isolates an unrelated passenger (zero rows, not
   an error).
6. Confirmed the Phase 11 financial-column protection trigger still
   fires, identical error message.
7. Confirmed a non-admin authenticated session still cannot read
   `admin_users` despite the new table grant.
8. Confirmed `anon` still receives `permission denied` — unaffected.
9. **Full reproducibility check**: dropped everything, built a
   completely fresh database, applied all 63 migrations (61 original +
   both this phase's) in one pass: clean, zero errors. Re-ran the full
   three-layer verification (privilege -> RLS -> application operation) on
   this fresh chain: every result identical to the incremental test.

## 15. Real hosted tests

**None executed by me this phase** — no hosted access. Everything above
is LOCAL TEST, explicitly labeled as such throughout, per this phase's
own classification rules.

## 16. Local tests

Fully itemized in §14 — nine distinct checks, two separate database
builds (incremental and fully-fresh), real reproduction of the actual
hosted failure before ever writing the fix.

## 17. Static checks

Full-chain grep for any table-level `GRANT`/`REVOKE` (found none prior
to this phase's own additions); re-read of every anon-adjacent RLS
policy to confirm `anon` genuinely needs no table grant; confirmed no
existing migration was modified (diff against the version prior to this
phase's edits).

## 18. PASS/FAIL/BLOCKED summary

| Test | Classification | Result |
|---|---|---|
| Full 61-migration chain, fresh DB | LOCAL TEST | PASS |
| Reproduce hosted privilege gap locally | LOCAL TEST | PASS (reproduced `permission denied`, confirming diagnosis) |
| Fix resolves privilege gap | LOCAL TEST | PASS |
| RLS isolation intact post-fix | LOCAL TEST | PASS |
| Financial-column protection intact post-fix | LOCAL TEST | PASS |
| Admin-only RLS intact post-fix | LOCAL TEST | PASS |
| `anon` correctly unaffected | LOCAL TEST | PASS |
| Full 63-migration chain, fresh DB | LOCAL TEST | PASS |
| Real hosted validation of this fix | BLOCKED | No network access from this sandbox |
| Passenger/Driver phone OTP | BLOCKED | Twilio not configured (unchanged, expected) |
| Full ride lifecycle (hosted) | BLOCKED | Depends on above |
| Realtime E2E (hosted) | BLOCKED | Depends on above |

## 19. Remaining external blockers

Identical to Phase 17: this sandbox's network egress excludes
`*.supabase.co`; Twilio is unconfigured/unfunded. Neither was touched or
worked around this phase.

## 20. Production-readiness assessment

**Materially improved, but not yet hosted-confirmed.** Before this
phase, the real severity of the privilege gap was unknown — it could
plausibly have been isolated to `admin_users` or could have affected
every table. It's now established, with direct evidence, that it's the
latter, that `SECURITY DEFINER` RPC-based operations were never at risk,
and that the fix is narrow, well-understood, and doesn't touch RLS. The
fix itself is locally proven reproducible and safe across nine distinct
checks on two independently-built databases. What remains is exactly one
thing: running it against the real project and confirming the same
results hold there — which is a strictly smaller, better-understood step
than where this phase started.

## 21. Exact next commands, for Windows

```powershell
# 1. Sync the two migration files from this delivery into your local repo,
#    then confirm the dry run shows exactly these two as pending:
pnpm exec supabase db push --dry-run

# 2. If (and only if) the dry run looks exactly as expected -- two
#    migrations, both additive, no conflicts -- apply for real:
pnpm exec supabase db push

# 3. Confirm local and remote migration history now match:
pnpm exec supabase migration list

# 4. Re-run the Phase 17 validation script -- expect the same three PASSes
#    as before, unchanged:
pnpm exec node packages\supabase\scripts\phase17-hosted-validation.mjs

# 5. Directly confirm the fix against the real project (the single most
#    important new check -- this is what actually proves the local
#    verification transfers to hosted reality):
#    Using your real admin test session, attempt a plain PostgREST read
#    of a table other than admin_users (e.g. `cities`, which requires no
#    ride data to exist) and confirm it now succeeds where it previously
#    would have failed with "permission denied".
```

Passenger/Driver OTP and the full ride lifecycle remain correctly
BLOCKED until Twilio or Test OTP numbers are configured -- not attempted,
not worked around, this phase.

---

Phase 18 complete. Not starting Phase 19.
