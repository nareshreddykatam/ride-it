-- ============================================================================
-- 20260903093000_cross_role_capability_provisioning.sql
--
-- Lets the SAME Supabase Auth identity hold both a Passenger capability
-- (public.passengers row) and a Driver capability (public.drivers row).
--
-- Root cause being fixed: handle_new_auth_user() (20260804090000, amended
-- since) only ever creates ONE of passengers/drivers, decided once at the
-- moment a NEW auth.users row is inserted, from that signup's requested
-- role. It never fires again for the same identity (Supabase Auth doesn't
-- insert a new auth.users row for a returning email/phone — same UUID,
-- same OTP flow). So a passenger who later opens the Driver app with the
-- same email authenticates successfully (same Auth identity, valid OTP)
-- but has no public.drivers row — and vice versa for a driver trying the
-- Passenger app.
--
-- public.users.role stays exactly as-is (single enum, unchanged meaning
-- and unchanged for every existing reader of it — admin dashboards,
-- referral role tracking, etc.). It is NOT the capability signal for
-- cross-role access; capability is decided by row existence in
-- passengers/drivers, exactly like Part 3's own onboarding-completeness
-- checks (isPassengerProfileComplete/isDriverPersonalInfoComplete) already
-- do. This migration only adds the missing "create the row that's
-- missing, for yourself, once" primitive — the app-level middleware/
-- RequireRole changes that route a same-email cross-role user into
-- onboarding instead of being signed out live in
-- packages/auth/src/middleware.ts and hooks.tsx, not here.
--
-- Neither function ever accepts a target user id — both act only on
-- auth.uid(), so a caller can only ever provision their OWN identity, and
-- can never grant themselves someone else's capability. Both are
-- idempotent (ON CONFLICT DO NOTHING) so a double call (double-click,
-- retry after a network blip) is harmless. Every value inserted matches
-- handle_new_auth_user()'s own inserts exactly (same default vehicle_type,
-- same verification_status default of 'pending' from the column
-- definition itself — this migration never touches verification_status,
-- so "authentication succeeds" never implies "driver is approved").
--
-- No RLS changes needed: public.drivers/passengers/wallets/
-- passenger_ride_pins already have no INSERT policy for authenticated
-- users at all (only handle_new_auth_user's trigger, SECURITY DEFINER,
-- could previously create these rows) — that stays true. These two new
-- functions are SECURITY DEFINER for the same reason the trigger already
-- is, not a new privilege escalation.
-- ============================================================================

create or replace function public.ensure_driver_profile()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  -- vehicle_type default mirrors handle_new_auth_user()'s own default
  -- ('auto') — the driver onboarding form's actual vehicle-type selection
  -- overwrites this via the existing upsertActiveVehicle() client call
  -- (packages/data/src/vehicles.ts), exactly as it already does for a
  -- direct driver signup.
  insert into public.drivers (id, vehicle_type)
  values (auth.uid(), 'auto')
  on conflict (id) do nothing;

  insert into public.wallets (user_id, balance)
  values (auth.uid(), 0)
  on conflict (user_id) do nothing;
end;
$$;

comment on function public.ensure_driver_profile() is
  'Creates a public.drivers (+ wallets) row for the calling user if one does not already exist. Idempotent, self-only (auth.uid()). Never sets verification_status beyond its pending default — authentication is not driver approval.';

grant execute on function public.ensure_driver_profile() to authenticated;

create or replace function public.ensure_passenger_profile()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  insert into public.passengers (id)
  values (auth.uid())
  on conflict (id) do nothing;

  insert into public.passenger_ride_pins (passenger_id, pin_hash)
  values (auth.uid(), crypt(public._generate_random_pin(), gen_salt('bf')))
  on conflict (passenger_id) do nothing;
end;
$$;

comment on function public.ensure_passenger_profile() is
  'Creates a public.passengers (+ passenger_ride_pins) row for the calling user if one does not already exist. Idempotent, self-only (auth.uid()).';

grant execute on function public.ensure_passenger_profile() to authenticated;
