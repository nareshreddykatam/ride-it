-- ============================================================================
-- 20260804090000_auth_user_provisioning.sql
-- Phase 4 addition. Two things, both compelling-technical-reason amendments
-- to the Phase 3 schema (flagged explicitly, not silently changed):
--
-- 1. users.phone was NOT NULL + globally unique + format-checked. Phase 3
--    didn't yet know Admin would authenticate by email/password rather than
--    phone OTP. Admins have no phone number at sign-in time, so the
--    constraint is relaxed to "phone required for passenger/driver, email
--    required for admin" — still fully enforced, just role-conditional.
--
-- 2. handle_new_auth_user(): the standard Supabase pattern of a trigger on
--    auth.users that provisions the matching public.users (+ passengers/
--    drivers) row automatically on first sign-in, reading `role` (and, for
--    drivers, `vehicle_type`) out of the auth call's user_metadata. See
--    packages/auth/src/phone-otp.ts for where that metadata is set.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Relax phone requirement for admin (email-based) accounts
-- ----------------------------------------------------------------------------
alter table public.users alter column phone drop not null;
alter table public.users drop constraint users_phone_unique;
alter table public.users drop constraint users_phone_format;

-- Uniqueness only where a phone exists (partial index) — two admins with
-- null phone are not "duplicates".
create unique index users_phone_unique_idx on public.users (phone) where phone is not null;

alter table public.users add constraint users_phone_format
  check (phone is null or phone ~ '^[6-9][0-9]{9}$');

-- The actual role-conditional requirement: passengers/drivers must have a
-- phone; admins must have an email. Both are DB-enforced, not just
-- convention.
alter table public.users add constraint users_role_contact_method
  check (
    (role = 'admin' and email is not null)
    or (role in ('passenger', 'driver') and phone is not null)
  );

-- ----------------------------------------------------------------------------
-- 2. Auto-provisioning trigger
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role_enum;
  v_vehicle_type public.vehicle_type_enum;
begin
  v_role := coalesce((new.raw_user_meta_data ->> 'role')::public.user_role_enum, 'passenger');

  insert into public.users (id, role, phone, email, full_name)
  values (
    new.id,
    v_role,
    new.phone,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do nothing;

  if v_role = 'passenger' then
    insert into public.passengers (id) values (new.id)
    on conflict (id) do nothing;

  elsif v_role = 'driver' then
    -- vehicle_type isn't collected by any existing onboarding screen yet
    -- (Documents screen has no vehicle picker) — defaults to 'auto' and is
    -- expected to be corrected during a future vehicle-registration step.
    -- Flagged in the Phase 4 review doc, not silently assumed.
    v_vehicle_type := coalesce((new.raw_user_meta_data ->> 'vehicle_type')::public.vehicle_type_enum, 'auto');
    insert into public.drivers (id, vehicle_type) values (new.id, v_vehicle_type)
    on conflict (id) do nothing;

  end if;
  -- Note: no 'admin' branch — admin_users rows are provisioned deliberately
  -- out-of-band (by a super admin via the admin_users table directly), not
  -- via self-service sign-up. See review doc.

  return new;
end;
$$;

comment on function public.handle_new_auth_user() is
  'Provisions the matching public.users(+passengers/drivers) row when a new auth.users row is created. Role comes from user_metadata set at signInWithOtp() time.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
