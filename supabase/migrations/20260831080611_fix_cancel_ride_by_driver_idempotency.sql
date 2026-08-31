-- ============================================================================
-- 20260831151500_fix_cancel_ride_by_driver_idempotency.sql
--
-- cancel_ride_by_driver() (20260831150000) checked authorization
-- (driver_id = auth.uid()) before checking whether the ride had already
-- been reset. That's correct for a genuinely unauthorized caller, but it
-- has a real bug for the driver's OWN double-press: after the first call
-- succeeds, driver_id is cleared to null — so a second call from the SAME
-- driver (a duplicate click racing the UI, or a retried request) would
-- find driver_id IS DISTINCT FROM auth.uid() (null vs. their id) and
-- raise "Not authorized", not return gracefully. That violates the
-- explicit idempotency requirement ("no duplicate events/notifications/
-- double-modification on double-press").
--
-- Fixed narrowly: when the driver_id match fails, check whether THIS
-- caller already has a driver_cancelled_reassigning ride_events row for
-- THIS ride (i.e. they are the one who caused the earlier reset) — if so,
-- return the current row as a benign no-op instead of raising. A caller
-- with no such event (a driver who was never assigned to this ride at
-- all) still hits the exception exactly as before — no authorization
-- weakening, only a correct idempotent path for the legitimate case.
-- ============================================================================

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

  if v_ride.driver_id is distinct from auth.uid() then
    -- Not currently this driver's ride. Before treating this as a real
    -- authorization violation, check whether it's actually this same
    -- driver double-pressing after their own earlier call already reset
    -- driver_id to null — a legitimate idempotent no-op, not an intrusion.
    if exists (
      select 1 from public.ride_events
      where ride_id = p_ride_id and event_type = 'driver_cancelled_reassigning' and actor_id = auth.uid()
    ) then
      return v_ride;
    end if;

    raise exception 'Not authorized to cancel this ride' using errcode = '42501';
  end if;

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

comment on function public.cancel_ride_by_driver(uuid, text) is
  'Driver-initiated cancellation of an accepted/driver_arriving ride. Atomically records the cancellation (ride_events), resets the SAME ride row back to requested (driver_id cleared, requested_at bumped) so the existing matching engine picks it up again, preserves the cancelling driver''s original ride_offers row (permanently excluding them from being re-offered this ride via _find_eligible_drivers()''s existing exclusion check), applies the existing strike business rule, and notifies the passenger. Idempotent both for a status that already moved on (no-op) and for the SAME driver double-calling after their own successful cancellation already cleared driver_id (detected via their own driver_cancelled_reassigning event, returned as a no-op rather than a false "not authorized").';
