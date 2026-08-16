-- ============================================================================
-- 20260815090000_passenger_ride_pins.sql
-- Phase 10. Replaces the per-ride SMS-OTP concept with a permanent
-- 4-digit Ride PIN set once per passenger and reused across every ride
-- until they change it.
--
-- STORAGE ISOLATION, deliberate: the hash lives in its own table, NOT as
-- a column on `passengers`. `passengers` already has
-- passengers_select_active_ride_driver (Phase 3) — a driver assigned to a
-- passenger's active ride can read that passenger's row. If pin_hash
-- lived on `passengers`, that existing (correct, needed-elsewhere) policy
-- would also hand the driver the PIN hash — a 4-digit space is trivially
-- brute-forceable even from a hash, so "only the hash, not the plaintext"
-- would not actually satisfy "Driver cannot retrieve passenger PIN." A
-- separate table with its own narrow policy is the correct boundary,
-- mirroring how Supabase itself keeps auth.users' password hash in a
-- separate schema from public.users.
-- ============================================================================

create table public.passenger_ride_pins (
  passenger_id uuid primary key references public.passengers (id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.passenger_ride_pins is 'Bcrypt hash (pgcrypto) of each passenger''s permanent 4-digit Ride PIN. Never the plaintext. Isolated from passengers on purpose — see migration header. No INSERT/UPDATE policy for any client role; only set_ride_pin() and handle_new_auth_user() (both SECURITY DEFINER) ever write here.';

alter table public.passenger_ride_pins enable row level security;

create policy "passenger_ride_pins_select_own" on public.passenger_ride_pins
  for select using (passenger_id = auth.uid());

-- Deliberately NO admin policy. There is no legitimate Admin use case for
-- reading or writing this table in this phase (per the brief: "Admin
-- cannot casually expose PINs") — a future admin-assisted PIN reset
-- should be its own narrowly-scoped RPC, not blanket table access.

create or replace function public._generate_random_pin()
returns text
language sql
volatile
security definer
set search_path = public, extensions
as $$
  select lpad((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 10000)::text, 4, '0');
$$;

revoke execute on function public._generate_random_pin() from public;
revoke execute on function public._generate_random_pin() from authenticated;

create or replace function public.set_ride_pin(p_new_pin text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin text;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.passengers where id = auth.uid()) then
    raise exception 'Caller is not a registered passenger' using errcode = '42501';
  end if;

  v_pin := coalesce(p_new_pin, public._generate_random_pin());

  if v_pin !~ '^[0-9]{4}$' then
    raise exception 'Ride PIN must be exactly 4 digits' using errcode = '22023';
  end if;

  insert into public.passenger_ride_pins (passenger_id, pin_hash, updated_at)
  values (auth.uid(), crypt(v_pin, gen_salt('bf')), now())
  on conflict (passenger_id) do update set pin_hash = excluded.pin_hash, updated_at = now();

  return v_pin;
end;
$$;

revoke execute on function public.set_ride_pin(text) from public;
grant execute on function public.set_ride_pin(text) to authenticated;

comment on function public.set_ride_pin(text) is 'Sole path for setting/changing a passenger''s Ride PIN. Returns the plaintext exactly once (to the caller, at the moment of setting) — never stored, never retrievable again afterward.';

create or replace function public.get_ride_pin_status()
returns table (has_pin boolean, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  return query
  select
    exists (select 1 from public.passenger_ride_pins p where p.passenger_id = auth.uid()),
    (select p.updated_at from public.passenger_ride_pins p where p.passenger_id = auth.uid());
end;
$$;

revoke execute on function public.get_ride_pin_status() from public;
grant execute on function public.get_ride_pin_status() to authenticated;

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

  if new.phone is not null and new.phone <> '' then
    if v_requested_role = 'driver' then
      v_role := 'driver';
    else
      v_role := 'passenger';
    end if;
  elsif new.email is not null then
    v_role := 'admin';
  else
    v_role := 'passenger';
  end if;

  insert into public.users (id, role, phone, email, full_name)
  values (new.id, v_role, new.phone, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;

  if v_role = 'passenger' then
    insert into public.passengers (id) values (new.id)
    on conflict (id) do nothing;

    -- Phase 10: permanent Ride PIN generated here, once, at account
    -- creation — not a new SMS OTP, not per-ride.
    insert into public.passenger_ride_pins (passenger_id, pin_hash)
    values (new.id, crypt(public._generate_random_pin(), gen_salt('bf')))
    on conflict (passenger_id) do nothing;

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

comment on function public.handle_new_auth_user() is 'Provisions public.users(+passengers/drivers/wallet) on new auth.users insert. SECURITY-CRITICAL: never assigns role=admin from any signup shape/metadata (Phase 6.2). Phase 10: passengers additionally get a permanent Ride PIN generated here, atomically, at account creation.';
