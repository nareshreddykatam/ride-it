-- ============================================================================
-- 20260821090000_fix_admin_role_regression_and_email_signup.sql
--
-- Restores the Phase 6.2 security fix (20260808090100_fix_admin_provisioning.sql)
-- that was silently regressed by 20260815090000_passenger_ride_pins.sql, which
-- reintroduced "phone absent + email present => admin" role inference. That
-- inference is removed again here, permanently: no signup shape or metadata
-- value ever produces role='admin'. Admin accounts remain exclusively
-- provisioned via provision_admin_user() (service_role-only, unchanged by
-- this migration).
--
-- Also relaxes users_role_contact_method to allow legitimate email-only
-- passenger/driver accounts -- required for the new Email OTP login option.
-- Previously this constraint required phone IS NOT NULL for any
-- passenger/driver row, which would reject an email-only signup outright,
-- independent of the trigger's own logic.
-- ============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_requested_role public.user_role_enum;
  v_role public.user_role_enum;
  v_vehicle_type public.vehicle_type_enum;
begin
  v_requested_role := (new.raw_user_meta_data ->> 'role')::public.user_role_enum;

  -- SECURITY-CRITICAL: no signup shape or metadata value ever produces
  -- 'admin' here -- restored from Phase 6.2, permanently re-fixing the
  -- regression introduced by 20260815090000_passenger_ride_pins.sql (which
  -- had reintroduced "phone absent + email present => admin"). 'driver'
  -- remains an honorable request -- not a privilege escalation, since
  -- driver and passenger are both non-privileged roles.
  if v_requested_role = 'driver' then
    v_role := 'driver';
  else
    v_role := 'passenger';
  end if;

  insert into public.users (id, role, phone, email, full_name)
  values (new.id, v_role, right(new.phone, 10), new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;

  if v_role = 'passenger' then
    insert into public.passengers (id) values (new.id)
    on conflict (id) do nothing;

    insert into public.passenger_ride_pins (passenger_id, pin_hash)
    values (new.id, crypt(public._generate_random_pin(), gen_salt('bf')))
    on conflict (passenger_id) do nothing;

  elsif v_role = 'driver' then
    v_vehicle_type := coalesce((new.raw_user_meta_data ->> 'vehicle_type')::public.vehicle_type_enum, 'auto');

    insert into public.drivers (id, vehicle_type)
    values (new.id, v_vehicle_type)
    on conflict (id) do nothing;

    insert into public.wallets (user_id, balance)
    values (new.id, 0)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_auth_user() is
  'Provisions public.users(+passengers/drivers/wallet/passenger_ride_pins) on new auth.users insert. SECURITY-CRITICAL: never assigns role=admin under any circumstance, for any signup shape or metadata -- restored from Phase 6.2 after a Phase 10 migration (20260815090000) silently regressed it back to email-only-implies-admin inference. Admin accounts can ONLY be created via provision_admin_user(), a service_role-only function, unchanged. Phone is normalized via right(new.phone,10) and is now optional -- Email OTP signups have none.';

-- ----------------------------------------------------------------------------
-- Relax users_role_contact_method: passenger/driver now needs phone OR
-- email (previously phone was strictly required), since Email OTP is now a
-- legitimate production signup path. Admin still strictly requires email --
-- unchanged.
-- ----------------------------------------------------------------------------
alter table public.users drop constraint users_role_contact_method;

alter table public.users add constraint users_role_contact_method
  check (
    (role = 'admin' and email is not null)
    or (role in ('passenger', 'driver') and (phone is not null or email is not null))
  );

comment on constraint users_role_contact_method on public.users is
  'Admin requires email. Passenger/driver requires phone OR email -- relaxed from phone-required (Phase 4) to support Email OTP signups without weakening the admin requirement.';
