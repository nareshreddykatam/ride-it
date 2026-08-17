-- ============================================================================
-- 20260823090000_protect_users_system_columns.sql
--
-- Vulnerability: users_update_own (Phase 3, 20260803121100_row_level_security.sql)
-- is `using (id = auth.uid()) with check (id = auth.uid())` — row-level
-- only, not column-level. Any authenticated passenger or driver can
-- therefore self-modify their own public.users row's `role` column
-- directly from the client, e.g.:
--
--   supabase.from("users").update({ role: "admin" }).eq("id", auth.uid())
--
-- This is a real privilege-escalation path: role='admin' is exactly what
-- gates is_admin() (public.admin_users membership is a separate check,
-- but role='admin' also flows into current_role_is('admin') and any code
-- that trusts public.users.role directly). is_active and deleted_at are
-- the same shape of problem — both are meant to be admin-controlled
-- (setPassengerActive() in packages/data/src/admin.ts documents itself as
-- "secured by users_all_admin RLS", which is only true for the row-level
-- check; nothing stopped a user from doing it to their own row via
-- users_update_own before this migration).
--
-- Fix: mirror the exact pattern already established for drivers
-- (20260808090000_protect_driver_system_columns.sql) and passengers
-- (20260819090100 protect_passenger_system_columns, in
-- 20260819090000_rating_protection.sql) — a BEFORE UPDATE trigger, not a
-- narrower RLS policy, since RLS cannot express column-level restriction
-- on its own. The trigger permits the write only when it is a real admin
-- session (is_admin()) or an explicitly trusted system write
-- (_mark_trusted_write(), already defined in
-- 20260808090000_protect_driver_system_columns.sql — reused here rather
-- than duplicated).
--
-- Legitimate writers audited, all preserved:
--   - handle_new_auth_user(): INSERT only, never UPDATE — unaffected by a
--     BEFORE UPDATE trigger.
--   - provision_admin_user() (20260808090100_fix_admin_provisioning.sql):
--     the sole legitimate path that sets role='admin'. It is
--     service_role-only (never callable by authenticated/anon), but
--     service_role's RLS bypass does NOT exempt it from ordinary table
--     triggers — so it must mark itself as a trusted write, exactly like
--     increment_driver_strike() does on the driver side. Updated below.
--   - setPassengerActive() (packages/data/src/admin.ts): only ever called
--     from the Admin app on a real admin session — is_admin() bypass
--     covers it, no code change needed.
-- ============================================================================

create or replace function public.protect_users_system_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted system writes (our own RPCs) and real admin sessions bypass
  -- the check entirely.
  if coalesce(current_setting('ride_it.trusted_write', true), 'false') = 'true'
     or public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.deleted_at is distinct from old.deleted_at
  then
    raise exception 'Cannot modify protected user fields directly' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_users_system_columns on public.users;
create trigger protect_users_system_columns
  before update on public.users
  for each row execute function public.protect_users_system_columns();

comment on function public.protect_users_system_columns() is
  'Blocks direct self-modification of users.role/is_active/deleted_at, regardless of write path (RLS alone cannot express column-level restriction — users_update_own is row-scoped only). full_name, phone, email, date_of_birth, and gender remain self-editable via profile update flows. Mirrors protect_driver_system_columns (Phase 6.2) and protect_passenger_system_columns (20260819090000).';

-- ----------------------------------------------------------------------------
-- provision_admin_user() must mark its role-flipping UPDATE as a trusted
-- write, or this new trigger would now block its own legitimate use —
-- service_role bypasses RLS but not table triggers, and provision_admin_user
-- is invoked via the service-role key with no end-user JWT (auth.uid() is
-- null in that context), so is_admin() would not cover it either.
-- Body otherwise unchanged from 20260808090100_fix_admin_provisioning.sql.
-- ----------------------------------------------------------------------------
create or replace function public.provision_admin_user(
  p_user_id uuid,
  p_admin_role_id uuid,
  p_is_super_admin boolean default false
)
returns public.admin_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.admin_users;
  v_updated_count integer;
begin
  perform public._mark_trusted_write();

  update public.users set role = 'admin' where id = p_user_id;
  get diagnostics v_updated_count = row_count;

  if v_updated_count = 0 then
    raise exception 'No users row found for %. Create the auth user first (Supabase Admin API or Dashboard), then call this function.', p_user_id
      using errcode = 'P0002';
  end if;

  -- Retire the passenger row handle_new_auth_user() created by default —
  -- every self-service-shaped signup defaults to passenger, including
  -- ones a trusted operator intends to promote to admin.
  delete from public.passengers where id = p_user_id;

  insert into public.admin_users (id, admin_role_id, is_super_admin)
  values (p_user_id, p_admin_role_id, p_is_super_admin)
  on conflict (id) do update set
    admin_role_id = excluded.admin_role_id,
    is_super_admin = excluded.is_super_admin,
    deleted_at = null
  returning * into v_admin;

  return v_admin;
end;
$$;

comment on function public.provision_admin_user(uuid, uuid, boolean) is
  'THE sole trusted mechanism for creating an admin account. service_role-only. Marks its role-flipping UPDATE as a trusted write (20260823090000) so protect_users_system_columns permits this specific, narrow, audited mutation. Never callable by an authenticated end-user session.';

revoke execute on function public.provision_admin_user(uuid, uuid, boolean) from public;
revoke execute on function public.provision_admin_user(uuid, uuid, boolean) from authenticated;
grant execute on function public.provision_admin_user(uuid, uuid, boolean) to service_role;
