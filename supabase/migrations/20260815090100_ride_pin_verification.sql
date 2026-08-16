-- ============================================================================
-- 20260815090100_ride_pin_verification.sql
-- Phase 10. The server-authoritative Ride PIN verification gate between
-- driver_arriving and ride_started.
--
-- REAL VULNERABILITY FOUND, not introduced this phase: rides_update_driver
-- (Phase 3) is `using (driver_id = auth.uid()) with check (driver_id =
-- auth.uid())` — broad, row-level only. The OLD verifyRideOtp()/startRide()
-- client functions were only ever a UI CONVENTION; nothing in the database
-- stopped an assigned driver from calling
-- `supabase.from('rides').update({status:'ride_started'})` directly,
-- skipping OTP entirely. This was never flagged in any prior review
-- because it was never exercised against a live database or specifically
-- probed. Fixed here with a trigger, reusing Phase 6.2's
-- _mark_trusted_write() mechanism exactly as-is (it's table-agnostic —
-- built for drivers, works identically here) rather than inventing a
-- second "trusted write" concept.
-- ============================================================================

-- rides.otp (per-ride SMS OTP) is retired — the Ride PIN is permanent and
-- lives on the passenger (passenger_ride_pins), not the ride.
-- otp_verified_at is renamed rather than dropped: the column's *meaning*
-- has fully changed (ride-PIN verification, not SMS-OTP verification) but
-- its role (timestamp of successful start-verification) is identical, so
-- renaming preserves history/intent instead of drop-and-recreate.
alter table public.rides drop column otp;
alter table public.rides rename column otp_verified_at to pin_verified_at;

comment on column public.rides.pin_verified_at is 'Set the moment the assigned driver''s entered Ride PIN matched (verify_ride_pin_and_start()). Phase 10 — was otp_verified_at (per-ride SMS OTP), retired in favor of the passenger''s permanent Ride PIN.';

-- ----------------------------------------------------------------------------
-- Trigger: blocks any direct client transition INTO ride_started unless
-- marked as a trusted write (verify_ride_pin_and_start() marks itself) or
-- performed by an admin. This is what actually closes the vulnerability —
-- without it, a driver's direct UPDATE would still succeed under
-- rides_update_driver's existing RLS regardless of this migration adding
-- a new RPC alongside it.
-- ----------------------------------------------------------------------------
create or replace function public.protect_ride_start_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ride_started' and old.status is distinct from 'ride_started' then
    if coalesce(current_setting('ride_it.trusted_write', true), 'false') != 'true' and not public.is_admin() then
      raise exception 'A ride can only start through Ride PIN verification' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_ride_start_transition on public.rides;
create trigger protect_ride_start_transition
  before update on public.rides
  for each row execute function public.protect_ride_start_transition();

comment on function public.protect_ride_start_transition() is 'Blocks any direct (non-trusted-write, non-admin) transition of rides.status to ride_started — closes a real gap where rides_update_driver''s broad RLS would otherwise let a driver bypass Ride PIN verification entirely by updating status directly.';

-- ----------------------------------------------------------------------------
-- verify_ride_pin_and_start — the single, atomic, server-authoritative
-- gate. NO ATTEMPT COUNTER, NO LOCKOUT — an incorrect PIN returns null
-- (not an error, not a recorded "attempt"); the ride simply doesn't
-- start. Deliberate product decision (brief item 6), not an oversight.
--
-- Unlike accept_ride_offer (Phase 8), the PIN check is NOT folded into the
-- final atomic UPDATE's WHERE clause via EXISTS. That pattern exists in
-- Phase 8 specifically to prevent a multi-driver RACE (two drivers
-- simultaneously trying to claim one ride). Here, only the single already-
-- assigned driver can ever call this successfully — there is no second
-- actor to race against — so a plain "check, then conditionally update"
-- is equally correct and clearer to read.
-- ----------------------------------------------------------------------------
create or replace function public.verify_ride_pin_and_start(p_ride_id uuid, p_entered_pin text)
returns public.rides
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ride public.rides;
  v_pin_hash text;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if v_ride.driver_id is distinct from auth.uid() then
    raise exception 'Caller is not the assigned driver for this ride' using errcode = '42501';
  end if;

  if v_ride.status is distinct from 'driver_arriving' then
    raise exception 'Ride is not awaiting Ride PIN verification' using errcode = 'P0001';
  end if;

  select pin_hash into v_pin_hash
  from public.passenger_ride_pins
  where passenger_id = v_ride.passenger_id;

  if v_pin_hash is null then
    raise exception 'No Ride PIN configured for this passenger' using errcode = 'P0001';
  end if;

  if crypt(p_entered_pin, v_pin_hash) is distinct from v_pin_hash then
    return null;
  end if;

  perform public._mark_trusted_write();

  update public.rides
  set status = 'ride_started', started_at = now(), pin_verified_at = now()
  where id = p_ride_id
    and driver_id = auth.uid()
    and status = 'driver_arriving'
  returning * into v_ride;

  if v_ride.id is not null then
    insert into public.ride_events (ride_id, event_type, actor_type, actor_id, payload)
    values (p_ride_id, 'ride_pin_verified', 'driver', auth.uid(), jsonb_build_object('verified_at', v_ride.pin_verified_at));
  end if;

  return v_ride;
end;
$$;

revoke execute on function public.verify_ride_pin_and_start(uuid, text) from public;
grant execute on function public.verify_ride_pin_and_start(uuid, text) to authenticated;

comment on function public.verify_ride_pin_and_start(uuid, text) is 'The sole path from driver_arriving to ride_started. Returns null (not an error) on an incorrect PIN — no attempt counter or lockout, by explicit product decision. Marks itself as a trusted write so protect_ride_start_transition permits this specific, narrow, audited mutation.';
