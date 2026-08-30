-- ============================================================================
-- 20260831093000_protect_ride_completion_transition.sql
--
-- REAL, LIVE-CONFIRMED VULNERABILITY (not theoretical) — verified with a
-- genuine non-admin driver session token against a real test ride, then
-- immediately cleaned up: rides_update_driver (Phase 3) is
-- `using (driver_id = auth.uid()) with check (driver_id = auth.uid())` —
-- broad, row-level only, with NO restriction on which status transitions
-- a driver may perform via a direct client update. Migration
-- 20260815090100 already closed this exact class of gap for the
-- driver_arriving -> ride_started transition (protect_ride_start_transition)
-- but never added the equivalent guard for -> ride_completed. Confirmed
-- live: a real driver session could PATCH rides.status directly to
-- 'ride_completed' on a ride still sitting in driver_arriving — i.e.
-- complete a ride WITHOUT the passenger ever having told them the correct
-- Ride PIN at all. This is the actual mechanism behind the reported "wrong
-- PIN starts/completes the ride" bug: the PIN check in
-- verify_ride_pin_and_start() was never the weak link (it's correctly
-- scoped to the ride's own passenger via v_ride.passenger_id, rejects a
-- wrong/foreign PIN, and never transitions the ride on failure) — the gap
-- was that a driver never needed to call it at all.
--
-- Fixed exactly the way 20260815090100 fixed the sibling transition: a
-- trigger blocking any non-trusted-write, non-admin transition into
-- ride_completed, reusing the same _mark_trusted_write() mechanism
-- complete_ride() already calls. No new "trusted write" concept invented.
-- ============================================================================

create or replace function public.protect_ride_completion_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ride_completed' and old.status is distinct from 'ride_completed' then
    if coalesce(current_setting('ride_it.trusted_write', true), 'false') != 'true' and not public.is_admin() then
      raise exception 'A ride can only be completed through the complete_ride() flow' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_ride_completion_transition on public.rides;
create trigger protect_ride_completion_transition
  before update on public.rides
  for each row execute function public.protect_ride_completion_transition();

comment on function public.protect_ride_completion_transition() is 'Blocks any direct (non-trusted-write, non-admin) transition of rides.status to ride_completed — closes a real, live-confirmed gap where rides_update_driver''s (and rides_update_passenger''s) broad RLS would otherwise let either party mark a ride completed directly, bypassing complete_ride()''s own ride_started precondition and, transitively, Ride PIN verification.';

-- ----------------------------------------------------------------------------
-- complete_ride() itself had a second, related gap: its UPDATE ... WHERE
-- status = 'ride_started' correctly refuses to complete a ride that was
-- never properly started, but on a non-matching row it silently RETURNED
-- an all-NULL rides row instead of raising — no exception, so the client
-- never saw an error, and the driver app's SUMMARY screen would render
-- `total_fare ?? 0` against that all-NULL row, i.e. exactly the reported
-- "completed ride shows ₹0 fare" symptom (the real ride's own total_fare
-- was never touched or corrupted in the database — this was purely a
-- misleading client-side artifact of treating a no-op as a success).
-- Now raises explicitly instead, so this can never again be mistaken for
-- a genuine completion by any caller (UI, or direct RPC invocation).
-- ----------------------------------------------------------------------------
create or replace function public.complete_ride(p_ride_id uuid)
returns public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  perform public._mark_trusted_write();

  update public.rides
  set status = 'ride_completed',
      completed_at = now(),
      payment_status = case when payment_method in ('cash', 'driver_upi') then 'paid' else payment_status end
  where id = p_ride_id
    and driver_id = auth.uid()
    and status = 'ride_started'
  returning * into v_ride;

  if v_ride.id is null then
    raise exception 'Ride is not in a state that can be completed (must be ride_started and assigned to the calling driver)' using errcode = 'P0001';
  end if;

  perform public._create_notification(
    v_ride.passenger_id,
    'ride_status',
    'Ride completed',
    format('Your ride is complete. Total fare: ₹%s.', v_ride.total_fare),
    jsonb_build_object('ride_id', v_ride.id)
  );
  perform public._create_notification(
    v_ride.driver_id,
    'ride_status',
    'Ride completed',
    format('Ride completed. Fare: ₹%s.', v_ride.total_fare),
    jsonb_build_object('ride_id', v_ride.id)
  );
  perform public._create_notification(
    v_ride.passenger_id,
    'ride_status',
    'How was your ride?',
    'Tap to rate your driver.',
    jsonb_build_object('ride_id', v_ride.id, 'kind', 'rating_reminder')
  );
  perform public._create_notification(
    v_ride.driver_id,
    'ride_status',
    'How was your passenger?',
    'Tap to rate your passenger.',
    jsonb_build_object('ride_id', v_ride.id, 'kind', 'rating_reminder')
  );

  return v_ride;
end;
$$;

comment on function public.complete_ride(uuid) is 'The sole path from ride_started to ride_completed. Raises P0001 (not a silent no-op) when the ride is not ride_started or not assigned to the calling driver — previously returned an all-NULL row on that path, which the client could mistake for a genuine ₹0-fare completion. Marks itself as a trusted write so protect_ride_completion_transition permits this specific, narrow, audited mutation.';
