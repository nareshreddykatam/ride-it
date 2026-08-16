-- ============================================================================
-- 20260815090300_matching_notifications.sql
-- Phase 10. Extends three Phase 8 matching functions (CREATE OR REPLACE,
-- same signatures — amending, not duplicating) to create notifications as
-- part of their existing atomic transitions. The Phase 8 ride-offer/
-- realtime mechanism remains entirely authoritative for actual ride
-- requests — these notifications are a communication artifact alongside
-- it, per the brief's explicit "notifications should not replace the
-- matching engine."
--
-- Idempotency: each notification is created only inside the same
-- conditional branch as the underlying state change that already
-- guarantees at-most-once semantics (a new ride_offers row only inserted
-- once per driver per batch; rides.status only transitions once per
-- ride), so no separate idempotency key is needed.
-- ============================================================================

create or replace function public.dispatch_next_batch(p_ride_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
  v_batch_size integer;
  v_offer_window integer;
  v_max_batches integer;
  v_next_batch integer;
  v_offered_count integer := 0;
  v_driver record;
begin
  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if v_ride.status not in ('requested', 'matched') then
    return 0;
  end if;

  v_batch_size := public._get_matching_setting_int('matching_batch_size', 3);
  v_offer_window := public._get_matching_setting_int('matching_offer_window_seconds', 15);
  v_max_batches := public._get_matching_setting_int('matching_max_batches', 5);

  select count(*) + 1 into v_next_batch
  from public.ride_events
  where ride_id = p_ride_id and event_type in ('batch_dispatched', 'batch_empty');

  if v_next_batch > v_max_batches then
    update public.rides
    set status = 'cancelled', cancelled_by = 'system', cancellation_reason = 'no_drivers_available'
    where id = p_ride_id and status in ('requested', 'matched');

    insert into public.ride_events (ride_id, event_type, actor_type, payload)
    values (p_ride_id, 'matching_exhausted', 'system', jsonb_build_object('batches_attempted', v_next_batch - 1));

    perform public._create_notification(
      v_ride.passenger_id,
      'ride_status',
      'No drivers available',
      'We couldn''t find a nearby driver for this ride. You have not been charged.',
      jsonb_build_object('ride_id', p_ride_id)
    );

    return 0;
  end if;

  for v_driver in select * from public._find_eligible_drivers(p_ride_id, v_batch_size) loop
    insert into public.ride_offers (
      ride_id, driver_id, batch_number, vehicle_type, pickup_address, drop_address,
      distance_km, base_fare, distance_fare, total_fare, currency,
      distance_to_pickup_meters, expires_at
    )
    values (
      p_ride_id, v_driver.driver_id, v_next_batch, v_ride.vehicle_type, v_ride.pickup_address, v_ride.drop_address,
      v_ride.distance_km, v_ride.base_fare, v_ride.distance_fare, v_ride.total_fare, v_ride.currency,
      v_driver.distance_meters, now() + (v_offer_window || ' seconds')::interval
    );
    v_offered_count := v_offered_count + 1;

    perform public._create_notification(
      v_driver.driver_id,
      'offer',
      'New ride request',
      format('Pickup: %s', coalesce(v_ride.pickup_address, 'nearby')),
      jsonb_build_object('ride_id', p_ride_id)
    );
  end loop;

  if v_offered_count > 0 then
    update public.rides set status = 'matched' where id = p_ride_id and status = 'requested';
    insert into public.ride_events (ride_id, event_type, actor_type, payload)
    values (p_ride_id, 'batch_dispatched', 'system', jsonb_build_object('batch_number', v_next_batch, 'driver_count', v_offered_count));
  else
    insert into public.ride_events (ride_id, event_type, actor_type, payload)
    values (p_ride_id, 'batch_empty', 'system', jsonb_build_object('batch_number', v_next_batch));
  end if;

  return v_offered_count;
end;
$$;

create or replace function public.accept_ride_offer(p_ride_id uuid)
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

  if not exists (select 1 from public.drivers where id = auth.uid()) then
    raise exception 'Caller is not a registered driver' using errcode = '42501';
  end if;

  update public.rides
  set driver_id = auth.uid(), status = 'accepted', accepted_at = now()
  where id = p_ride_id
    and status = 'matched'
    and driver_id is null
    and exists (
      select 1 from public.ride_offers o
      where o.ride_id = p_ride_id
        and o.driver_id = auth.uid()
        and o.status = 'pending'
        and o.expires_at > now()
    )
  returning * into v_ride;

  if v_ride.id is null then
    update public.ride_offers
    set status = case when expires_at > now() then 'superseded' else 'expired' end,
        responded_at = now()
    where ride_id = p_ride_id and driver_id = auth.uid() and status = 'pending';

    return null;
  end if;

  update public.ride_offers
  set status = 'accepted', responded_at = now()
  where ride_id = p_ride_id and driver_id = auth.uid() and status = 'pending';

  update public.ride_offers
  set status = 'superseded', responded_at = now()
  where ride_id = p_ride_id and driver_id != auth.uid() and status = 'pending';

  insert into public.ride_events (ride_id, event_type, actor_type, actor_id, payload)
  values (p_ride_id, 'driver_accepted', 'driver', auth.uid(), '{}'::jsonb);

  perform public._create_notification(
    v_ride.passenger_id,
    'ride_status',
    'Driver assigned',
    'Your driver is on the way.',
    jsonb_build_object('ride_id', v_ride.id, 'driver_id', auth.uid())
  );

  return v_ride;
end;
$$;
