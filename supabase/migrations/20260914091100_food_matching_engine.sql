-- ============================================================================
-- 20260914091100_food_matching_engine.sql
-- Ridora Food Phase 1. Driver-matching engine for food deliveries — mirrors
-- the ride matching engine (20260813090300_matching_engine.sql) exactly in
-- shape: pull-based dispatch (no cron/Edge Function scheduler available in
-- this environment either), same batch/expiry/advisory-lock discipline.
-- Reuses public._get_matching_setting_int() (generic key/default reader)
-- with food-specific app_settings keys rather than a duplicate helper.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- _find_eligible_food_drivers — internal only. Eligibility:
--   food mode + online + approved      -> WHERE predicates below
--   active subscription                -> EXISTS on public.subscriptions
--                                          (the SAME subscription a driver
--                                          uses for Ride mode — Food is
--                                          another work mode for the same
--                                          driver identity, not a separate
--                                          product requiring a second
--                                          subscription), matched to the
--                                          driver's OWN current vehicle_type
--                                          — subscriptions are vehicle-type-
--                                          specific (AUDIT-008, 20260907091000
--                                          /20260910140000), and that applies
--                                          equally regardless of which mode
--                                          the subscription is being used for
--   fresh location                     -> location_updated_at within the
--                                          configured freshness window
--   not busy with a ride               -> no non-terminal rides row
--   not busy with another delivery     -> no accepted/picked_up assignment
--   not already offered this order     -> no existing assignment row
--   not mid-offer on a different order -> no other pending, unexpired
--                                          offer elsewhere
-- ----------------------------------------------------------------------------
create or replace function public._find_eligible_food_drivers(p_order_id uuid, p_batch_size integer)
returns table (driver_id uuid, distance_meters double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    d.id as driver_id,
    ST_Distance(d.current_location, o.restaurant_location) as distance_meters
  from public.food_orders o
  join public.drivers d
    on d.is_online = true
   and d.verification_status = 'approved'
   and d.work_mode = 'food'
   and d.current_location is not null
   and d.location_updated_at is not null
   and d.location_updated_at > now() - (public._get_matching_setting_int('food_driver_location_freshness_seconds', 120) || ' seconds')::interval
  where o.id = p_order_id
    and exists (
      select 1 from public.subscriptions s
      where s.driver_id = d.id and s.status = 'active' and s.expires_at > now() and s.vehicle_type = d.vehicle_type
    )
    and not exists (
      select 1 from public.rides r2
      where r2.driver_id = d.id and r2.status not in ('ride_completed', 'cancelled', 'rated')
    )
    and not exists (
      select 1 from public.food_delivery_assignments a2
      where a2.driver_id = d.id and a2.status in ('accepted', 'picked_up')
    )
    and not exists (
      select 1 from public.food_delivery_assignments a
      where a.order_id = o.id and a.driver_id = d.id
    )
    and not exists (
      select 1 from public.food_delivery_assignments a3
      where a3.driver_id = d.id and a3.status = 'offered' and a3.expires_at > now()
    )
  order by d.current_location <-> o.restaurant_location
  limit p_batch_size;
$$;

revoke execute on function public._find_eligible_food_drivers(uuid, integer) from public;
revoke execute on function public._find_eligible_food_drivers(uuid, integer) from authenticated;

-- ----------------------------------------------------------------------------
-- dispatch_next_food_batch — mirrors dispatch_next_batch. Only dispatches
-- once the order is ready_for_pickup (no point offering drivers a delivery
-- before the restaurant has actually prepared the food).
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_next_food_batch(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.food_orders;
  v_batch_size integer;
  v_offer_window integer;
  v_max_batches integer;
  v_next_batch integer;
  v_offered_count integer := 0;
  v_driver record;
begin
  select * into v_order from public.food_orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.status != 'ready_for_pickup' then
    return 0;
  end if;

  v_batch_size := public._get_matching_setting_int('food_matching_batch_size', 3);
  v_offer_window := public._get_matching_setting_int('food_matching_offer_window_seconds', 20);
  v_max_batches := public._get_matching_setting_int('food_matching_max_batches', 5);

  select count(*) + 1 into v_next_batch
  from public.food_delivery_events
  where order_id = p_order_id and event_type in ('batch_dispatched', 'batch_empty');

  if v_next_batch > v_max_batches then
    insert into public.food_delivery_events (order_id, event_type, actor_type, payload)
    values (p_order_id, 'matching_exhausted', 'system', jsonb_build_object('batches_attempted', v_next_batch - 1));
    return 0;
  end if;

  for v_driver in select * from public._find_eligible_food_drivers(p_order_id, v_batch_size) loop
    insert into public.food_delivery_assignments (
      order_id, driver_id, restaurant_name_snapshot, restaurant_address_snapshot, pickup_location,
      delivery_address_snapshot, delivery_location, distance_to_restaurant_meters,
      order_amount, driver_earning, expires_at
    )
    values (
      p_order_id, v_driver.driver_id, v_order.restaurant_name_snapshot, v_order.restaurant_address_snapshot, v_order.restaurant_location,
      v_order.delivery_address, v_order.delivery_location, v_driver.distance_meters,
      v_order.total_amount, v_order.delivery_fee, now() + (v_offer_window || ' seconds')::interval
    );
    v_offered_count := v_offered_count + 1;
  end loop;

  if v_offered_count > 0 then
    insert into public.food_delivery_events (order_id, event_type, actor_type, payload)
    values (p_order_id, 'batch_dispatched', 'system', jsonb_build_object('batch_number', v_next_batch, 'driver_count', v_offered_count));
  else
    insert into public.food_delivery_events (order_id, event_type, actor_type, payload)
    values (p_order_id, 'batch_empty', 'system', jsonb_build_object('batch_number', v_next_batch));
  end if;

  return v_offered_count;
end;
$$;

revoke execute on function public.dispatch_next_food_batch(uuid) from public;
grant execute on function public.dispatch_next_food_batch(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- advance_food_order_matching — heartbeat, mirrors advance_ride_matching.
-- Safe to call for any order_id: performs internal bookkeeping only and
-- returns just the status string, no sensitive fields.
-- ----------------------------------------------------------------------------
create or replace function public.advance_food_order_matching(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.food_order_status_enum;
  v_pending_count integer;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select status into v_status from public.food_orders where id = p_order_id;
  if v_status is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_status != 'ready_for_pickup' then
    return v_status::text;
  end if;

  update public.food_delivery_assignments
  set status = 'expired', responded_at = now()
  where order_id = p_order_id and status = 'offered' and expires_at <= now();

  select count(*) into v_pending_count
  from public.food_delivery_assignments
  where order_id = p_order_id and status = 'offered' and expires_at > now();

  if v_pending_count = 0 then
    perform public.dispatch_next_food_batch(p_order_id);
  end if;

  select status into v_status from public.food_orders where id = p_order_id;
  return v_status::text;
end;
$$;

revoke execute on function public.advance_food_order_matching(uuid) from public;
grant execute on function public.advance_food_order_matching(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- accept_food_delivery_offer — mirrors accept_ride_offer's atomic-UPDATE +
-- advisory-lock pattern exactly, using the SAME lock key
-- (hashtext(driver_id)) as accept_ride_offer/enforce_driver_work_mode_switch
-- so acceptance, ride-acceptance, and mode-switching on the same driver can
-- never interleave.
-- ----------------------------------------------------------------------------
create or replace function public.accept_food_delivery_offer(p_order_id uuid)
returns public.food_delivery_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.food_delivery_assignments;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.drivers where id = auth.uid() and work_mode = 'food') then
    raise exception 'Caller is not a registered driver in Food mode' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text)::bigint);

  update public.food_delivery_assignments
  set status = 'accepted', responded_at = now()
  where order_id = p_order_id
    and driver_id = auth.uid()
    and status = 'offered'
    and expires_at > now()
    and not exists (select 1 from public.drivers d where d.id = auth.uid() and d.work_mode != 'food')
    and not exists (
      select 1 from public.rides r2
      where r2.driver_id = auth.uid() and r2.status not in ('ride_completed', 'cancelled', 'rated')
    )
    and not exists (
      select 1 from public.food_delivery_assignments a2
      where a2.driver_id = auth.uid() and a2.id != food_delivery_assignments.id and a2.status in ('accepted', 'picked_up')
    )
  returning * into v_assignment;

  if v_assignment.id is null then
    update public.food_delivery_assignments
    set status = case when expires_at > now() then 'superseded' else 'expired' end,
        responded_at = now()
    where order_id = p_order_id and driver_id = auth.uid() and status = 'offered';

    return null;
  end if;

  update public.food_delivery_assignments
  set status = 'superseded', responded_at = now()
  where order_id = p_order_id and driver_id != auth.uid() and status = 'offered';

  perform public._mark_trusted_write();
  update public.food_orders set driver_id = auth.uid(), status = 'driver_assigned', driver_assigned_at = now()
  where id = p_order_id and status = 'ready_for_pickup';

  insert into public.food_order_status_history (order_id, status, actor_type, actor_id)
  values (p_order_id, 'driver_assigned', 'driver', auth.uid());

  return v_assignment;
end;
$$;

revoke execute on function public.accept_food_delivery_offer(uuid) from public;
grant execute on function public.accept_food_delivery_offer(uuid) to authenticated;

comment on function public.accept_food_delivery_offer(uuid) is
  'Race-safe food delivery acceptance. Same advisory-lock-on-driver-id + atomic-UPDATE discipline as accept_ride_offer, re-checking work_mode=food and "no active ride/other delivery" inside the same WHERE clause so a driver cannot accept two deliveries or a delivery+ride concurrently.';

create or replace function public.reject_food_delivery_offer(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  update public.food_delivery_assignments
  set status = 'rejected', responded_at = now()
  where order_id = p_order_id and driver_id = auth.uid() and status = 'offered';
end;
$$;

revoke execute on function public.reject_food_delivery_offer(uuid) from public;
grant execute on function public.reject_food_delivery_offer(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- driver_mark_picked_up / driver_mark_delivered — the assigned driver's
-- own two remaining lifecycle actions. complete_food_delivery finalizes
-- payment_status for COD orders here (mirrors rides.complete_ride marking
-- cash/UPI-direct rides paid) — online orders are unaffected (already
-- captured earlier in checkout).
-- ----------------------------------------------------------------------------
create or replace function public.driver_mark_picked_up(p_order_id uuid)
returns public.food_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.food_orders;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.food_orders where id = p_order_id and driver_id = auth.uid() and status = 'driver_assigned') then
    raise exception 'Order not found, not assigned to caller, or not ready for pickup' using errcode = 'P0001';
  end if;

  update public.food_delivery_assignments
  set status = 'picked_up', picked_up_at = now()
  where order_id = p_order_id and driver_id = auth.uid() and status = 'accepted';

  insert into public.food_order_status_history (order_id, status, actor_type, actor_id)
  values (p_order_id, 'picked_up', 'driver', auth.uid());

  -- The spec's driver flow has no separate "start navigating to customer"
  -- action between pickup confirmation and delivery — out_for_delivery is
  -- the immediate, automatic consequence of pickup, not a second driver
  -- button. food_orders.status is therefore set directly to
  -- out_for_delivery (picked_up would never be externally observable as
  -- the CURRENT order status if set here first, since this is one
  -- transaction) — the picked_up transition is still fully audited via the
  -- history row above and via food_delivery_assignments.status/picked_up_at.
  perform public._mark_trusted_write();
  update public.food_orders
  set status = 'out_for_delivery', picked_up_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.food_order_status_history (order_id, status, actor_type, actor_id)
  values (p_order_id, 'out_for_delivery', 'driver', auth.uid());

  return v_order;
end;
$$;

revoke execute on function public.driver_mark_picked_up(uuid) from public;
grant execute on function public.driver_mark_picked_up(uuid) to authenticated;

create or replace function public.driver_mark_delivered(p_order_id uuid)
returns public.food_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.food_orders;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  perform public._mark_trusted_write();

  update public.food_orders
  set status = 'delivered', delivered_at = now(),
      payment_status = case when payment_method = 'cod' then 'paid' else payment_status end
  where id = p_order_id and driver_id = auth.uid() and status = 'out_for_delivery'
  returning * into v_order;

  if v_order.id is null then
    raise exception 'Order not found, not assigned to caller, or not out for delivery' using errcode = 'P0001';
  end if;

  update public.food_delivery_assignments
  set status = 'delivered', delivered_at = now()
  where order_id = p_order_id and driver_id = auth.uid() and status = 'picked_up';

  insert into public.food_order_status_history (order_id, status, actor_type, actor_id)
  values (p_order_id, 'delivered', 'driver', auth.uid());

  perform public._create_notification(
    v_order.passenger_id,
    'food_order',
    'Order delivered',
    'Your order has been delivered. Enjoy your meal!',
    jsonb_build_object('order_id', v_order.id)
  );

  return v_order;
end;
$$;

revoke execute on function public.driver_mark_delivered(uuid) from public;
grant execute on function public.driver_mark_delivered(uuid) to authenticated;
