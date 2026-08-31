-- ============================================================================
-- 20260831150000_ride_lifecycle_cancellation_reassignment.sql
--
-- PART 1 — Passenger cancellation after ride start.
-- passenger_cancel_active_ride() currently only allows status in
-- ('accepted', 'driver_arriving') — a passenger has no way to cancel once
-- verify_ride_pin_and_start() has moved the ride to 'ride_started', even
-- though the product requirement is "cancel at minimum after ride has
-- started". No new cancellation-fee/refund rule is introduced here (none
-- exists anywhere in this schema to preserve or extend) — this purely
-- widens the existing, already-correct cancellation path to one more
-- status. Also adds the ride_events row this function was missing (its
-- sibling passenger_cancel_matching_ride() already writes one --
-- passenger_cancel_active_ride() never did, which is the actual audit gap
-- Part 1 asks to close, not a new event type invented for its own sake).
--
-- PART 2 — Driver cancellation with automatic reassignment.
-- cancelRideByDriver() (packages/data/src/rides.ts) was a plain client
-- .update() that terminally cancelled the ride — no reassignment, forcing
-- the passenger to rebook from scratch, and non-atomic with the separate
-- increment_driver_strike() call (flagged as debt directly in that
-- function's own comment). cancel_ride_by_driver() below replaces it with
-- one atomic SECURITY DEFINER RPC that:
--   1. Verifies the caller is actually the ride's assigned driver.
--   2. Records the cancellation as a ride_events row (audit trail).
--   3. Resets the SAME ride (same id, same passenger_id) back to
--      'requested' with a fresh requested_at, driver_id cleared — reusing
--      the existing matching engine (dispatch_next_batch/
--      _find_eligible_drivers/accept_ride_offer) rather than building a
--      second one.
--   4. Deliberately does NOT delete or touch the cancelling driver's
--      original ride_offers row. _find_eligible_drivers() already has
--      `not exists (select 1 from ride_offers o where o.ride_id = r.id
--      and o.driver_id = d.id)` — any driver with ANY prior offer row for
--      this ride is permanently excluded from being re-offered it. This
--      is the safest existing mechanism for per-ride exclusion (Part 2
--      explicitly asks for the safest EXISTING mechanism, not a new one)
--      and requires zero new code.
--   5. Preserves the existing increment_driver_strike() business rule,
--      now atomic with the cancellation instead of a second round-trip.
--   6. Notifies the passenger so the app can show realtime reassignment
--      state.
-- ============================================================================

create or replace function public.passenger_cancel_active_ride(p_ride_id uuid, p_reason text default 'Passenger cancelled'::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ride public.rides;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  update public.rides
  set status = 'cancelled', cancelled_by = 'passenger', cancellation_reason = p_reason, cancelled_at = now()
  where id = p_ride_id
    and passenger_id = auth.uid()
    and status in ('accepted', 'driver_arriving', 'ride_started')
  returning * into v_ride;

  if v_ride.id is not null then
    insert into public.ride_events (ride_id, event_type, actor_type, actor_id, payload)
    values (p_ride_id, 'passenger_cancelled_active', 'passenger', auth.uid(), jsonb_build_object('reason', p_reason, 'previous_status', v_ride.status));

    if v_ride.driver_id is not null then
      perform public._create_notification(
        v_ride.driver_id,
        'ride_status',
        'Ride cancelled',
        'The passenger cancelled this ride.',
        jsonb_build_object('ride_id', v_ride.id)
      );
    end if;
  end if;
end;
$$;

comment on function public.passenger_cancel_active_ride(uuid, text) is
  'Passenger-initiated cancellation for accepted/driver_arriving/ride_started rides. No cancellation fee or refund logic — none exists in this schema for this path, and this function does not invent one. Idempotent: the status filter means a second call after the first succeeds matches zero rows and is a silent no-op (no duplicate event/notification).';

-- ----------------------------------------------------------------------------
-- cancel_ride_by_driver(): atomic cancel-and-reassign. Supersedes the
-- non-atomic client .update() + separate increment_driver_strike() call —
-- see packages/data/src/rides.ts's cancelRideByDriver(), updated in the
-- same change to call this RPC instead.
-- ----------------------------------------------------------------------------
create or replace function public.cancel_ride_by_driver(p_ride_id uuid, p_reason text default 'Driver cancelled'::text)
returns public.rides
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ride public.rides;
  v_prior_status public.ride_status_enum;
  v_cancelling_driver uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select * into v_ride from public.rides where id = p_ride_id for update;

  if v_ride.id is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  -- Only the ride's currently assigned driver may cancel it — never
  -- trusted from any client-supplied driver id, derived solely from
  -- auth.uid() and the ride's own driver_id column.
  if v_ride.driver_id is distinct from auth.uid() then
    raise exception 'Not authorized to cancel this ride' using errcode = '42501';
  end if;

  -- Idempotent: a duplicate cancel click (or a race with the passenger/
  -- system already having moved the ride on) finds a status outside this
  -- set and returns the current row unchanged — no duplicate event,
  -- notification, or strike.
  if v_ride.status not in ('accepted', 'driver_arriving') then
    return v_ride;
  end if;

  v_prior_status := v_ride.status;
  v_cancelling_driver := auth.uid();

  update public.rides
  set status = 'requested',
      driver_id = null,
      matched_at = null,
      accepted_at = null,
      requested_at = now(),
      cancelled_by = null,
      cancellation_reason = null,
      cancelled_at = null
  where id = p_ride_id
  returning * into v_ride;

  insert into public.ride_events (ride_id, event_type, actor_type, actor_id, payload)
  values (
    p_ride_id,
    'driver_cancelled_reassigning',
    'driver',
    v_cancelling_driver,
    jsonb_build_object('reason', p_reason, 'previous_status', v_prior_status, 'cancelled_driver_id', v_cancelling_driver)
  );

  -- Existing business rule (Phase 6.1), now atomic with the cancellation
  -- instead of a second, separately-failable client round-trip.
  perform public.increment_driver_strike();

  perform public._create_notification(
    v_ride.passenger_id,
    'ride_status',
    'Finding you another driver',
    'Your driver cancelled the ride. We are searching for another driver now.',
    jsonb_build_object('ride_id', p_ride_id, 'reason', 'driver_cancelled')
  );

  return v_ride;
end;
$$;

revoke all on function public.cancel_ride_by_driver(uuid, text) from public;
grant execute on function public.cancel_ride_by_driver(uuid, text) to authenticated;

comment on function public.cancel_ride_by_driver(uuid, text) is
  'Driver-initiated cancellation of an accepted/driver_arriving ride. Atomically records the cancellation (ride_events), resets the SAME ride row back to requested (driver_id cleared, requested_at bumped) so the existing matching engine picks it up again, preserves the cancelling driver''s original ride_offers row (permanently excluding them from being re-offered this ride via _find_eligible_drivers()''s existing exclusion check), applies the existing strike business rule, and notifies the passenger. Idempotent — a status outside (accepted, driver_arriving) is a no-op returning the current row.';
