-- Correct the enum CASE result used when a food delivery offer cannot be
-- accepted. Keep the acceptance, locking, authorization, and mode checks
-- identical to 20260914091100_food_matching_engine.sql.
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
    set status = case
          when expires_at > now()
            then 'superseded'::public.food_delivery_assignment_status_enum
          else 'expired'::public.food_delivery_assignment_status_enum
        end,
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
