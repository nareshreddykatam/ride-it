-- ============================================================================
-- 20260805090000_fix_admin_role_inference.sql
-- Phase 4.5 validation fix.
--
-- Bug found: handle_new_auth_user() defaulted ANY user with no explicit
-- `role` in user_metadata to 'passenger'. Admin accounts are provisioned
-- out-of-band (Supabase Dashboard "Invite user", or the Admin API) and
-- won't have that metadata set unless whoever creates the account
-- remembers to pass it explicitly — easy to forget, and the failure mode
-- was silent and confusing: the account would get role='passenger' AND a
-- spurious public.passengers row, then fail the Admin app's own middleware
-- role check on first sign-in (redirected out with "wrong_app"), with
-- nothing in the UI explaining why a legitimate admin got bounced.
--
-- Fix: infer 'admin' when the new auth.users row has an email but no phone
-- (the actual, structural difference between how admins vs
-- passengers/drivers sign up in this system) rather than defaulting
-- everything without explicit metadata to 'passenger'. Explicit metadata
-- (when present) is still honored first — this only changes the fallback.
--
-- This does NOT fully solve admin provisioning by itself: an admin still
-- needs a corresponding admin_users row (with a valid admin_role_id) to
-- pass RLS checks — that remains a required, separate, deliberately manual
-- step. See AUTHENTICATION_VALIDATION_REPORT.md for the full operational
-- sequence this implies.
-- ============================================================================

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
  v_role := (new.raw_user_meta_data ->> 'role')::public.user_role_enum;

  if v_role is null then
    if new.phone is not null and new.phone <> '' then
      v_role := 'passenger';
    elsif new.email is not null then
      v_role := 'admin';
    else
      -- Shouldn't normally happen (Supabase requires phone or email to
      -- create a user at all) — falls back to the old default rather than
      -- leaving v_role null and failing the insert outright.
      v_role := 'passenger';
    end if;
  end if;

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
    v_vehicle_type := coalesce((new.raw_user_meta_data ->> 'vehicle_type')::public.vehicle_type_enum, 'auto');
    insert into public.drivers (id, vehicle_type) values (new.id, v_vehicle_type)
    on conflict (id) do nothing;

  end if;
  -- Still no 'admin' branch here by design — see admin-auth.ts comment and
  -- the review doc. A public.users row with role='admin' is necessary but
  -- not sufficient; the admin_users row (admin_role_id) is a separate,
  -- deliberately manual provisioning step.

  return new;
end;
$$;

comment on function public.handle_new_auth_user() is
  'Provisions the matching public.users(+passengers/drivers) row on new auth.users insert. Role: explicit user_metadata.role first, else inferred from phone-vs-email presence (Phase 4.5 fix — was previously defaulting everything to passenger). Admin accounts additionally require a manually-created admin_users row — not handled here.';
