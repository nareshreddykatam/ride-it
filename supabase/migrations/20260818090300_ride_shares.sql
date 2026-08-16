-- ============================================================================
-- 20260818090300_ride_shares.sql
-- Phase 13. Secure ride sharing with a trusted contact.
--
-- DELIBERATE, NARROW EXCEPTION to this project's consistent "no anon
-- access, ever" posture (established Phase 3, reaffirmed explicitly in
-- Phase 12's own RLS testing). A trusted contact receiving a share link
-- is, by definition, not a Ride It account holder — there is no session
-- to authenticate. The token itself IS the authorization mechanic here,
-- exactly like any bearer-token capability URL (a password-reset link, a
-- calendar-invite link). This is only safe because:
--   - the token is 256 bits of real CSPRNG entropy (pgcrypto
--     gen_random_bytes(32), same generator class as Phase 10's Ride PIN,
--     just a far larger space appropriate for an unguessable token
--     rather than a human-typed 4-digit PIN)
--   - get_shared_ride_info() returns ONLY a fixed, narrow set of fields
--     (never fare, never PIN, never the passenger's phone/email)
--   - it independently re-checks expiry, revocation, AND that the
--     underlying ride is still non-terminal on every single call — a
--     share that outlives its ride is worthless the instant the ride
--     ends, regardless of its stored expires_at
--   - a wrong/guessed token returns null, not a distinguishing error —
--     no enumeration signal
-- ============================================================================

create table public.ride_shares (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  passenger_id uuid not null references public.passengers (id) on delete cascade,
  trusted_contact_id uuid references public.trusted_contacts (id) on delete set null,
  token text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ride_shares_expires_future check (expires_at > created_at)
);

create index ride_shares_ride_idx on public.ride_shares (ride_id);
create index ride_shares_token_idx on public.ride_shares (token) where revoked_at is null;

comment on table public.ride_shares is 'Tokens are never database IDs — 256-bit CSPRNG values from create_ride_share(). The token column has its own unique constraint and its own lookup index specifically so get_shared_ride_info() never needs to touch ride_shares.id for authorization.';

alter table public.ride_shares enable row level security;

create policy "ride_shares_all_own_passenger" on public.ride_shares
  for all using (passenger_id = auth.uid()) with check (passenger_id = auth.uid());

create or replace function public.create_ride_share(
  p_ride_id uuid,
  p_trusted_contact_id uuid default null,
  p_duration_hours integer default 4
)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ride public.rides;
  v_token text;
  v_share_id uuid;
  v_expires timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select r.* into v_ride from public.rides r where r.id = p_ride_id;
  if v_ride.id is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if v_ride.passenger_id is distinct from auth.uid() then
    raise exception 'Caller does not own this ride' using errcode = '42501';
  end if;

  if v_ride.status in ('ride_completed', 'cancelled', 'rated') then
    raise exception 'Cannot share a ride that has already ended' using errcode = 'P0001';
  end if;

  if p_trusted_contact_id is not null then
    if not exists (select 1 from public.trusted_contacts where id = p_trusted_contact_id and passenger_id = auth.uid() and deleted_at is null) then
      raise exception 'Trusted contact not found' using errcode = 'P0002';
    end if;
  end if;

  v_expires := now() + (least(greatest(p_duration_hours, 1), 12) || ' hours')::interval;
  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.ride_shares (ride_id, passenger_id, trusted_contact_id, token, expires_at)
  values (p_ride_id, auth.uid(), p_trusted_contact_id, v_token, v_expires)
  returning ride_shares.id into v_share_id;

  insert into public.ride_events (ride_id, event_type, actor_type, actor_id, payload)
  values (p_ride_id, 'ride_shared', 'passenger', auth.uid(), jsonb_build_object('share_id', v_share_id));

  return query select v_share_id, v_token, v_expires;
end;
$$;

revoke execute on function public.create_ride_share(uuid, uuid, integer) from public;
grant execute on function public.create_ride_share(uuid, uuid, integer) to authenticated;

create or replace function public.revoke_ride_share(p_share_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  update public.ride_shares
  set revoked_at = now()
  where id = p_share_id and passenger_id = auth.uid() and revoked_at is null;
end;
$$;

revoke execute on function public.revoke_ride_share(uuid) from public;
grant execute on function public.revoke_ride_share(uuid) to authenticated;

create or replace function public.get_shared_ride_info(p_token text)
returns table (
  ride_status public.ride_status_enum,
  driver_name text,
  vehicle_type public.vehicle_type_enum,
  pickup_address text,
  drop_address text,
  driver_lat double precision,
  driver_lng double precision,
  driver_location_updated_at timestamptz,
  shared_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_share public.ride_shares;
  v_ride public.rides;
begin
  if p_token is null or length(p_token) != 64 then
    return;
  end if;

  select * into v_share from public.ride_shares where token = p_token;
  if v_share.id is null then
    return;
  end if;

  if v_share.revoked_at is not null or v_share.expires_at <= now() then
    return;
  end if;

  select * into v_ride from public.rides where id = v_share.ride_id;
  if v_ride.id is null or v_ride.status in ('ride_completed', 'cancelled', 'rated') then
    return;
  end if;

  return query
  select
    v_ride.status,
    u.full_name,
    v_ride.vehicle_type,
    v_ride.pickup_address,
    v_ride.drop_address,
    case when d.current_location is not null then ST_Y(d.current_location::geometry)::double precision end,
    case when d.current_location is not null then ST_X(d.current_location::geometry)::double precision end,
    d.location_updated_at,
    v_share.created_at
  from public.rides r
  left join public.drivers d on d.id = r.driver_id
  left join public.users u on u.id = r.driver_id
  where r.id = v_ride.id;
end;
$$;

revoke execute on function public.get_shared_ride_info(text) from public;
grant execute on function public.get_shared_ride_info(text) to anon;
grant execute on function public.get_shared_ride_info(text) to authenticated;

comment on function public.get_shared_ride_info(text) is 'The only anon-granted function in this project. Token possession is the entire authorization — see migration header. Never returns fare, PIN, or passenger contact details. Re-validates expiry/revocation/live-ride-status on every call, not just at share-creation time.';
