-- ============================================================================
-- 20260903091500_e2e_test_profile_provisioning.sql
--
-- Extends the existing, trusted E2E provisioning pattern
-- (e2e_provision_driver_readiness, 20260820090300) rather than granting
-- service_role broad table access. service_role deliberately has NO
-- SELECT/INSERT/UPDATE grant on public.users/passengers/drivers/vehicles
-- (verified: only REFERENCES/TRIGGER/TRUNCATE) — every write path to
-- those tables is intentionally either RLS-scoped (authenticated) or a
-- narrow SECURITY DEFINER RPC. These two new RPCs follow that exact
-- model: both refuse to act on anything that isn't already marked
-- `e2e_test_user: true` in its OWN auth.users.raw_user_meta_data,
-- checked server-side, same as the existing function.
--
-- Needed because handle_new_auth_user() (unchanged) only ever sets
-- full_name from signup metadata — date_of_birth/gender are collected by
-- the real onboarding forms, which a script-provisioned test account
-- never goes through. This is a test-account bootstrapping convenience,
-- not a new account-creation path — createUser() (Admin API) is still
-- the only way the underlying auth.users/public.users rows come to
-- exist at all.
-- ============================================================================

create or replace function public.e2e_complete_profile(
  p_user_id uuid,
  p_date_of_birth date,
  p_gender public.gender_enum,
  p_full_name text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_e2e boolean;
begin
  select coalesce((raw_user_meta_data->>'e2e_test_user')::boolean, false)
  into v_is_e2e
  from auth.users
  where id = p_user_id;

  if not coalesce(v_is_e2e, false) then
    raise exception 'e2e_complete_profile may only act on a metadata-marked E2E test user' using errcode = '42501';
  end if;

  perform public._mark_trusted_write();

  update public.users
  set date_of_birth = p_date_of_birth,
      gender = p_gender,
      full_name = coalesce(p_full_name, full_name)
  where id = p_user_id;
end;
$$;

revoke execute on function public.e2e_complete_profile(uuid, date, public.gender_enum, text) from public;
revoke execute on function public.e2e_complete_profile(uuid, date, public.gender_enum, text) from authenticated;
grant execute on function public.e2e_complete_profile(uuid, date, public.gender_enum, text) to service_role;

comment on function public.e2e_complete_profile(uuid, date, public.gender_enum, text) is 'Dev-only test-account bootstrapping: fills date_of_birth/gender/full_name (not collected by handle_new_auth_user() for a script-provisioned account) for an already metadata-marked E2E test user. service_role-only — never callable by a real authenticated session, since a real user completes onboarding through the normal profile-update path instead.';

-- ----------------------------------------------------------------------------
-- Driver vehicle + payment-method-flags provisioning — same marker gate,
-- same service_role-only grant. Never touches verification_status,
-- rating, or any other protect_driver_system_columns-guarded field;
-- accepts_cash/accepts_driver_upi/accepts_online are not protected by
-- that trigger (see its definition) and are the same fields a real
-- driver sets themselves in Payment Settings.
-- ----------------------------------------------------------------------------
create or replace function public.e2e_provision_driver_vehicle(
  p_driver_id uuid,
  p_vehicle_type public.vehicle_type_enum,
  p_registration_number text,
  p_make text default null,
  p_model text default null,
  p_color text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_e2e boolean;
begin
  select coalesce((raw_user_meta_data->>'e2e_test_user')::boolean, false)
  into v_is_e2e
  from auth.users
  where id = p_driver_id;

  if not coalesce(v_is_e2e, false) then
    raise exception 'e2e_provision_driver_vehicle may only act on a metadata-marked E2E test user' using errcode = '42501';
  end if;

  perform public._mark_trusted_write();

  update public.drivers
  set accepts_cash = true
  where id = p_driver_id;

  if not exists (
    select 1 from public.vehicles where driver_id = p_driver_id and is_active = true
  ) then
    insert into public.vehicles (driver_id, vehicle_type, registration_number, make, model, color, is_active)
    values (p_driver_id, p_vehicle_type, p_registration_number, p_make, p_model, p_color, true);
  end if;
end;
$$;

revoke execute on function public.e2e_provision_driver_vehicle(uuid, public.vehicle_type_enum, text, text, text, text) from public;
revoke execute on function public.e2e_provision_driver_vehicle(uuid, public.vehicle_type_enum, text, text, text, text) from authenticated;
grant execute on function public.e2e_provision_driver_vehicle(uuid, public.vehicle_type_enum, text, text, text, text) to service_role;

comment on function public.e2e_provision_driver_vehicle(uuid, public.vehicle_type_enum, text, text, text, text) is 'Dev-only test-account bootstrapping: registers an active vehicle and enables Cash for an already metadata-marked E2E test driver, idempotently. service_role-only.';
