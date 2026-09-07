-- ============================================================================
-- 20260907092000_fix_e2e_readiness_vehicle_type.sql
--
-- Regression check found while making subscriptions vehicle-specific
-- (20260907091000): e2e_provision_driver_readiness() (20260820090300) is a
-- currently-active, service_role-only test helper that inserts into
-- public.subscriptions without a vehicle_type — which the prior migration
-- made NOT NULL with a FK to subscription_plans(vehicle_type, plan). Left
-- unfixed, this function would start failing outright for E2E test setup.
--
-- Fix: derive vehicle_type from the test driver's own drivers.vehicle_type
-- row (same pattern as create_pending_subscription_payment/
-- admin_grant_driver_subscription), never a new parameter. Every other
-- line — the E2E-metadata gate, _mark_trusted_write(), the verification
-- approval update, the idempotent subscription check, the service_role-only
-- grant — is unchanged from 20260820090300.
-- ============================================================================

create or replace function public.e2e_provision_driver_readiness(p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_e2e boolean;
  v_vehicle_type public.vehicle_type_enum;
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

  select vehicle_type into v_vehicle_type from public.drivers where id = p_driver_id;

  if not exists (
    select 1 from public.subscriptions
    where driver_id = p_driver_id
      and status = 'active'
      and expires_at > now()
  ) then
    insert into public.subscriptions (driver_id, vehicle_type, plan, status, amount, starts_at, expires_at)
    values (p_driver_id, v_vehicle_type, 'monthly', 'active', 999.00, now(), now() + interval '30 days');
  end if;
end;
$$;

revoke execute on function public.e2e_provision_driver_readiness(uuid) from public;
grant execute on function public.e2e_provision_driver_readiness(uuid) to service_role;

comment on function public.e2e_provision_driver_readiness(uuid) is 'Phase 20, development-only. Idempotently approves + subscribes a driver, but ONLY if auth.users.raw_user_meta_data marks them as an E2E test user. Never touches is_online/current_location/vehicle_type itself — only reads the driver''s existing vehicle_type to satisfy subscriptions.vehicle_type (20260907). service_role-only grant.';
