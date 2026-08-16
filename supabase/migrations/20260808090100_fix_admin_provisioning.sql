-- ============================================================================
-- 20260808090100_fix_admin_provisioning.sql
-- Phase 6.2 hardening, item 2.
--
-- Your review correctly rejected Phase 6.1's fix as insufficient: "email
-- present + phone absent = admin" is still an inference from signup data
-- shape, not real authorization — it assumed dashboard-created accounts
-- are the only phone-absent signups, which is an assumption about how
-- Supabase is configured, not something this code enforces.
--
-- Fix: handle_new_auth_user() no longer infers 'admin' under ANY
-- circumstance, for ANY signup shape. Every self-service account — phone
-- OTP or email/password, with any user_metadata — defaults to 'passenger'
-- (or 'driver' if explicitly requested, which remains safe: driver is not
-- a privileged role relative to passenger). Admin accounts can ONLY be
-- created via the new provision_admin_user() function below, which is
-- granted EXECUTE only to the `service_role` — never `authenticated`,
-- never `anon`. A regular user session, no matter what it sends at
-- sign-up, cannot reach this function at all.
-- ============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_role public.user_role_enum;
  v_role public.user_role_enum;
  v_vehicle_type public.vehicle_type_enum;
begin
  v_requested_role := (new.raw_user_meta_data ->> 'role')::public.user_role_enum;

  -- No signup shape or metadata value ever produces 'admin' here — full
  -- stop. 'driver' remains an honorable request (not a privilege
  -- escalation — driver and passenger are both non-privileged roles).
  if v_requested_role = 'driver' then
    v_role := 'driver';
  else
    v_role := 'passenger';
  end if;

  insert into public.users (id, role, phone, email, full_name)
  values (new.id, v_role, new.phone, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;

  if v_role = 'passenger' then
    insert into public.passengers (id) values (new.id)
    on conflict (id) do nothing;

  elsif v_role = 'driver' then
    v_vehicle_type := coalesce((new.raw_user_meta_data ->> 'vehicle_type')::public.vehicle_type_enum, 'auto');
    insert into public.drivers (id, vehicle_type) values (new.id, v_vehicle_type)
    on conflict (id) do nothing;

    insert into public.wallets (user_id, balance) values (new.id, 0)
    on conflict (user_id) do nothing;

  end if;

  return new;
end;
$$;

comment on function public.handle_new_auth_user() is
  'Provisions public.users(+passengers/drivers/wallet) on new auth.users insert. SECURITY-CRITICAL (Phase 6.2): never assigns role=admin under any circumstance, for any signup shape or metadata — every self-service account defaults to passenger unless driver is explicitly requested. Admin accounts can ONLY be created via provision_admin_user(), a service_role-only function.';

-- ----------------------------------------------------------------------------
-- The trusted admin-provisioning mechanism. Documented precisely so there
-- is exactly one sanctioned path, not an implied convention:
--
--   1. A trusted operator, using the Supabase service-role key (via
--      getSupabaseAdminClient() from @ride-it/supabase in a secure backend
--      context, a one-off ops script, or the Supabase Dashboard's own
--      "Create user" flow — NEVER the anon key, NEVER a browser session),
--      creates the auth.users row (email + password).
--   2. handle_new_auth_user() fires automatically and creates a
--      public.users row with role='passenger' (+ a passengers row) — the
--      same safe default every signup gets. This is expected and
--      harmless; step 3 corrects it.
--   3. The same trusted operator calls provision_admin_user(user_id,
--      admin_role_id, is_super_admin) using the service-role client. This
--      flips role to 'admin', removes the passengers row created in step
--      2, and creates the admin_users row — atomically, in one function.
--
-- This function's EXECUTE grant is the actual enforcement: only
-- `service_role` has it. No amount of client-controlled sign-up metadata
-- can reach this function at all, let alone influence what it does.
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
  'THE sole trusted mechanism for creating an admin account. service_role-only — see the migration comment above for the exact 3-step operational sequence. Never callable by an authenticated end-user session.';

revoke execute on function public.provision_admin_user(uuid, uuid, boolean) from public;
revoke execute on function public.provision_admin_user(uuid, uuid, boolean) from authenticated;
grant execute on function public.provision_admin_user(uuid, uuid, boolean) to service_role;
