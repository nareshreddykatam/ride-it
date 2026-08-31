-- ============================================================================
-- 20260831152000_fix_passenger_cancel_previous_status.sql
--
-- Bug found during Part 1 testing: passenger_cancel_active_ride()
-- (20260831150000) read v_ride.status AFTER the UPDATE ... RETURNING had
-- already overwritten it to 'cancelled', so the ride_events payload's
-- "previous_status" field always recorded 'cancelled' instead of the
-- actual prior state (accepted/driver_arriving/ride_started) — a real
-- audit-trail defect, confirmed live (a ride_started ride's cancellation
-- event recorded previous_status: "cancelled"). Fixed by reading the
-- status in a separate SELECT before the UPDATE, same pattern already
-- used correctly in cancel_ride_by_driver()'s v_prior_status.
-- ============================================================================

create or replace function public.passenger_cancel_active_ride(p_ride_id uuid, p_reason text default 'Passenger cancelled'::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ride public.rides;
  v_prior_status public.ride_status_enum;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select status into v_prior_status
  from public.rides
  where id = p_ride_id and passenger_id = auth.uid() and status in ('accepted', 'driver_arriving', 'ride_started');

  update public.rides
  set status = 'cancelled', cancelled_by = 'passenger', cancellation_reason = p_reason, cancelled_at = now()
  where id = p_ride_id
    and passenger_id = auth.uid()
    and status in ('accepted', 'driver_arriving', 'ride_started')
  returning * into v_ride;

  if v_ride.id is not null then
    insert into public.ride_events (ride_id, event_type, actor_type, actor_id, payload)
    values (p_ride_id, 'passenger_cancelled_active', 'passenger', auth.uid(), jsonb_build_object('reason', p_reason, 'previous_status', v_prior_status));

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
