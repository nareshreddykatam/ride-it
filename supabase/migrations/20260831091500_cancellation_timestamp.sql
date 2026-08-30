-- ============================================================================
-- 20260831091500_cancellation_timestamp.sql
--
-- rides.cancelled_at already exists but nothing ever wrote to it: both
-- passenger_cancel_active_ride() and passenger_cancel_matching_ride() set
-- status/cancelled_by/cancellation_reason but never cancelled_at, so every
-- cancelled ride in the database has a null timestamp. The driver-side
-- cancellation path (a plain client update in cancelRideByDriver(),
-- packages/data/src/rides.ts) has the matching fix applied directly in
-- that update call rather than needing a migration.
--
-- No new columns/tables — cancelled_at has existed since the base rides
-- schema. Only the two RPC bodies change (set cancelled_at = now()).
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
    and status in ('accepted', 'driver_arriving')
  returning * into v_ride;

  if v_ride.id is not null and v_ride.driver_id is not null then
    perform public._create_notification(
      v_ride.driver_id,
      'ride_status',
      'Ride cancelled',
      'The passenger cancelled this ride.',
      jsonb_build_object('ride_id', v_ride.id)
    );
  end if;
end;
$$;

create or replace function public.passenger_cancel_matching_ride(p_ride_id uuid, p_reason text default 'Passenger cancelled'::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  update public.rides
  set status = 'cancelled', cancelled_by = 'passenger', cancellation_reason = p_reason, cancelled_at = now()
  where id = p_ride_id and passenger_id = auth.uid() and status in ('requested', 'matched');
  get diagnostics v_count = row_count;

  if v_count > 0 then
    update public.ride_offers
    set status = 'superseded', responded_at = now()
    where ride_id = p_ride_id and status = 'pending';

    insert into public.ride_events (ride_id, event_type, actor_type, actor_id, payload)
    values (p_ride_id, 'passenger_cancelled_during_matching', 'passenger', auth.uid(), jsonb_build_object('reason', p_reason));
  end if;
end;
$$;
