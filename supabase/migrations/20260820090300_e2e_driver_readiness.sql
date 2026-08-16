-- ============================================================================
-- 20260820090300_e2e_driver_readiness.sql
-- Phase 20. Development-only E2E auth bootstrap support.
--
-- WHY THIS IS NEEDED: the real Admin app approves drivers via a plain
-- `drivers` table UPDATE (packages/data/src/admin.ts,
-- setDriverVerificationStatus), which works because that call runs under
-- a real authenticated admin session — is_admin() evaluates true for
-- that specific caller's auth.uid(). A service-role connection has no
-- auth.uid() (it isn't tied to any specific user), so is_admin() would
-- correctly evaluate false, and protect_driver_system_columns (Phase
-- 6.2) would correctly reject the same update if attempted directly via
-- the service-role client. That protection is intentional and is NOT
-- weakened here.
--
-- Instead: a narrowly-scoped SECURITY DEFINER function whose OWN
-- authorization check is not "is the caller an admin" but "is the
-- TARGET a metadata-marked E2E test user" — checked directly against
-- auth.users.raw_user_meta_data->>'e2e_test_user', the same marker
-- packages/supabase/src/e2e.ts sets when creating the dedicated E2E
-- account via the real, officially-supported
-- supabase.auth.admin.createUser() API. This function can NEVER act on
-- a real driver, regardless of who calls it or what role they call it
-- with — a narrower, more defensible boundary than is_admin() would be
-- here, since the entire point is to let a server-side script with no
-- interactive admin session provision only its own dedicated, clearly
-- marked throwaway test account.
--
-- EXECUTE is granted to service_role only — never authenticated, never
-- anon. A regular user session could never call this even if they knew
-- it existed.
-- ============================================================================

create or replace function public.e2e_provision_driver_readiness(p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_e2e boolean;
begin
  select coalesce((raw_user_meta_data->>'e2e_test_user')::boolean, false)
  into v_is_e2e
  from auth.users
  where id = p_driver_id;

  if not coalesce(v_is_e2e, false) then
    raise exception 'e2e_provision_driver_readiness may only act on a metadata-marked E2E test user' using errcode = '42501';
  end if;

  perform public._mark_trusted_write();

  update public.drivers
  set verification_status = 'approved'
  where id = p_driver_id
    and verification_status <> 'approved';

  if not exists (
    select 1 from public.subscriptions
    where driver_id = p_driver_id
      and status = 'active'
      and expires_at > now()
  ) then
    insert into public.subscriptions (driver_id, plan, status, amount, starts_at, expires_at)
    values (p_driver_id, 'monthly', 'active', 999.00, now(), now() + interval '30 days');
  end if;
end;
$$;

revoke execute on function public.e2e_provision_driver_readiness(uuid) from public;
grant execute on function public.e2e_provision_driver_readiness(uuid) to service_role;

comment on function public.e2e_provision_driver_readiness(uuid) is 'Phase 20, development-only. Idempotently approves + subscribes a driver, but ONLY if auth.users.raw_user_meta_data marks them as an E2E test user (set by packages/supabase/src/e2e.ts via the real admin.createUser API). Never touches is_online/current_location/vehicle_type — the driver app''s own real online-toggle flow remains genuinely exercised, not bypassed. service_role-only grant.';
