-- ============================================================================
-- 20260808090200_audit_phase3_security_functions.sql
-- Phase 6.2 hardening, item 4 — the deferred audit of is_admin(),
-- is_super_admin(), has_permission(), current_role_is() from Phase 3.
--
-- Findings for all four, stated plainly:
--   - Auth requirement: each reads auth.uid() directly from the verified
--     JWT context — not a parameter, not client-suppliable. Cannot be
--     forged by passing a different value; there is nothing to pass.
--   - Ownership/role logic: each is a pure read (EXISTS / SELECT) against
--     admin_users or users, scoped to auth.uid(). No write capability, so
--     "no ability to modify another user's data" is trivially satisfied —
--     there's no modification at all.
--   - search_path: already pinned (`set search_path = public`) on all four
--     since Phase 3. No change needed.
--   - has_permission(permission_code text): the one function with a
--     parameter. permission_code is used only in an equality comparison
--     inside a JOIN (`ap.code = permission_code`), never concatenated into
--     dynamic SQL — no injection surface, and passing an arbitrary string
--     can only ever make the EXISTS check false (no matching permission),
--     never true for something it shouldn't be. Not called from any
--     application code yet (confirmed in Phase 3/4 reviews).
--   - Privilege escalation: none found. None of the four can be used to
--     grant, modify, or forge admin status — they only ever report on
--     status that's already true in admin_users/users, which only
--     provision_admin_user() (service_role-only, see prior migration) can
--     set.
--
-- The one real gap, consistent with every other Phase 6.1/6.2 finding:
-- execute privileges were never explicitly scoped. Postgres grants EXECUTE
-- to PUBLIC by default on function creation unless revoked — these four
-- have been implicitly callable by `anon` this whole time. Since they're
-- read-only and scoped to auth.uid() (which is NULL for anon, making every
-- check trivially false), this was not exploitable — but it's exactly the
-- "appropriate execute grants" criterion this audit exists to check, and
-- these functions ARE used inside RLS policies evaluated on behalf of
-- `authenticated` throughout the schema, so `authenticated` must keep
-- EXECUTE (revoking without re-granting would break every policy that
-- calls them — effectively all RLS in this schema).
-- ============================================================================

revoke execute on function public.current_role_is(public.user_role_enum) from public;
grant execute on function public.current_role_is(public.user_role_enum) to authenticated;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

revoke execute on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

revoke execute on function public.is_driver() from public;
grant execute on function public.is_driver() to authenticated;

revoke execute on function public.is_passenger() from public;
grant execute on function public.is_passenger() to authenticated;

revoke execute on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

comment on function public.is_admin() is
  'Phase 6.2 audit: reviewed, no vulnerabilities found — pure read scoped to auth.uid(), no client-controllable input. Execute grant tightened from implicit PUBLIC to explicit authenticated (required — used inside RLS policies evaluated for that role throughout the schema).';
