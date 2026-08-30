-- ============================================================================
-- 20260831100000_minimum_matching_window.sql
--
-- REAL ROOT CAUSE (verified by reading the live matching_offer_window_seconds
-- / matching_batch_size / matching_max_batches app_settings values, not
-- assumed): dispatch_next_batch() counts attempts via ride_events
-- (batch_dispatched + batch_empty) and terminates the instant that count
-- exceeds matching_max_batches (currently 6), regardless of how much real
-- wall-clock time has elapsed. Each batch's offer window is only
-- matching_offer_window_seconds (15s), and — critically — an EMPTY batch
-- (zero eligible drivers found) writes its ride_events row and returns
-- immediately, without waiting out any window at all. So a ride with no
-- eligible drivers online can exhaust all 6 batches, and be marked
-- 'no_drivers_available', within a handful of seconds — nowhere near even
-- the current ~90s theoretical ceiling (6 * 15s), let alone a genuine
-- 3-minute search. This migration makes wall-clock elapsed time (measured
-- from rides.requested_at, which already exists and is set exactly once
-- at ride creation — no new column needed) the primary gate for
-- "matching_exhausted", not batch count.
-- ============================================================================

insert into public.app_settings (key, value, description) values
  ('matching_minimum_search_seconds', '180', 'Minimum wall-clock time (from rides.requested_at) matching must keep genuinely retrying before it may be marked no_drivers_available — a real product requirement, not a display-only countdown. A successful match still ends the search immediately regardless of this value; this only bounds how long an ride with NO accepting driver keeps being retried before giving up.')
on conflict (key) do nothing;

-- matching_max_batches remains a genuine safety ceiling (dispatch_next_batch
-- must never loop forever even if the time gate below were ever bypassed by
-- a bug), but is no longer the practical limiter — at the new
-- matching_offer_window_seconds-spaced retry cadence (see the throttle
-- added below), reaching the old value of 6 would already happen well
-- inside the new 3-minute minimum. Raised generously so it's never the
-- reason a genuinely-still-searching ride gets cut off early.
update public.app_settings set value = '30' where key = 'matching_max_batches';

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
  v_min_search_seconds integer;
  v_min_search_elapsed boolean;
  v_next_batch integer;
  v_offered_count integer := 0;
  v_driver record;
  v_last_attempt_at timestamptz;
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
  v_max_batches := public._get_matching_setting_int('matching_max_batches', 30);
  v_min_search_seconds := public._get_matching_setting_int('matching_minimum_search_seconds', 180);
  v_min_search_elapsed := now() >= v_ride.requested_at + (v_min_search_seconds || ' seconds')::interval;

  -- Retry throttle: without this, a ride with zero eligible drivers would
  -- have dispatch_next_batch re-run _find_eligible_drivers and write a
  -- fresh ride_events row on every single advance_ride_matching() heartbeat
  -- poll (every few seconds) for the full 3-minute window. Reusing the
  -- existing offer-window setting as the retry cadence — no new setting
  -- invented — bounds that to roughly one attempt per matching_offer_window_seconds,
  -- which is exactly what "the system may continue searching until the
  -- 3-minute window expires" calls for: periodic retrying, not constant
  -- hammering. The very first dispatch (v_last_attempt_at is null) is
  -- never throttled.
  select max(created_at) into v_last_attempt_at
  from public.ride_events
  where ride_id = p_ride_id and event_type in ('batch_dispatched', 'batch_empty');

  if v_last_attempt_at is not null and now() < v_last_attempt_at + (v_offer_window || ' seconds')::interval then
    return 0;
  end if;

  select count(*) + 1 into v_next_batch
  from public.ride_events
  where ride_id = p_ride_id and event_type in ('batch_dispatched', 'batch_empty');

  -- Hard safety ceiling — independent of the time gate, so a bug in the
  -- throttle/time logic above still can't cause an unbounded retry loop.
  -- At the throttled cadence this is never the practical limiter (see the
  -- app_settings row comment above).
  if v_next_batch > v_max_batches then
    update public.rides
    set status = 'cancelled', cancelled_by = 'system', cancellation_reason = 'no_drivers_available'
    where id = p_ride_id and status in ('requested', 'matched');

    insert into public.ride_events (ride_id, event_type, actor_type, payload)
    values (p_ride_id, 'matching_exhausted', 'system', jsonb_build_object('batches_attempted', v_next_batch - 1, 'reason', 'max_batches'));

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
  end loop;

  if v_offered_count > 0 then
    update public.rides set status = 'matched' where id = p_ride_id and status = 'requested';
    insert into public.ride_events (ride_id, event_type, actor_type, payload)
    values (p_ride_id, 'batch_dispatched', 'system', jsonb_build_object('batch_number', v_next_batch, 'driver_count', v_offered_count));
  else
    insert into public.ride_events (ride_id, event_type, actor_type, payload)
    values (p_ride_id, 'batch_empty', 'system', jsonb_build_object('batch_number', v_next_batch));

    -- This attempt found nobody. Only actually give up once the genuine
    -- 3-minute minimum has elapsed — otherwise leave the ride exactly as
    -- it is (still 'requested'/'matched') so the next heartbeat, roughly
    -- one offer-window later, tries again. This is what makes 3 minutes
    -- an honest minimum: a ride with truly zero eligible drivers keeps
    -- being retried the whole time, not just cut off at the old batch cap.
    if v_min_search_elapsed then
      update public.rides
      set status = 'cancelled', cancelled_by = 'system', cancellation_reason = 'no_drivers_available'
      where id = p_ride_id and status in ('requested', 'matched');

      insert into public.ride_events (ride_id, event_type, actor_type, payload)
      values (p_ride_id, 'matching_exhausted', 'system', jsonb_build_object('batches_attempted', v_next_batch, 'reason', 'min_search_window_elapsed'));
    end if;
  end if;

  return v_offered_count;
end;
$$;

revoke execute on function public.dispatch_next_batch(uuid) from public;
grant execute on function public.dispatch_next_batch(uuid) to authenticated;

comment on function public.dispatch_next_batch(uuid) is
  'Offers the ride to the next batch of nearest eligible drivers, throttled to roughly once per matching_offer_window_seconds. Only marks a ride cancelled/no_drivers_available once BOTH this attempt found zero drivers AND the matching_minimum_search_seconds wall-clock floor (measured from rides.requested_at) has elapsed — matching_max_batches remains only as an independent hard safety ceiling. Callable directly, but normally invoked via advance_ride_matching().';
