-- ============================================================================
-- 20260815090200_ride_lifecycle_notifications.sql
-- Phase 10. Notification helper + three lifecycle transitions converted
-- from plain client-side UPDATEs into narrow RPCs.
--
-- WHY these three specifically needed converting: markDriverArriving(),
-- completeRide(), and cancelRide() (post-acceptance) were all plain
-- `supabase.from('rides').update(...)` calls, correctly secured by
-- existing RLS for the status transition itself — but notifications
-- "must come from secure server/database paths" and must never trust
-- recipient_id/ride_id/type "from an untrusted client" (brief item 18).
-- A client-side call has no way to also trigger a trustworthy server-side
-- notification insert as part of the same transition — so the transition
-- itself needed to move server-side. Each RPC below does exactly what its
-- plain-UPDATE predecessor did, plus one notification insert, atomically.
-- ============================================================================

create or replace function public._create_notification(
  p_user_id uuid,
  p_type public.notification_type_enum,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, data, channel)
  values (p_user_id, p_type, p_title, p_body, p_data, 'push');
end;
$$;

revoke execute on function public._create_notification(uuid, public.notification_type_enum, text, text, jsonb) from public;
revoke execute on function public._create_notification(uuid, public.notification_type_enum, text, text, jsonb) from authenticated;

create or replace function public.mark_driver_arriving(p_ride_id uuid)
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

  update public.rides
  set status = 'driver_arriving'
  where id = p_ride_id
    and driver_id = auth.uid()
    and status = 'accepted'
  returning * into v_ride;

  if v_ride.id is not null then
    perform public._create_notification(
      v_ride.passenger_id,
      'driver_arrival',
      'Your driver has arrived',
      'Tell your driver your Ride PIN to start the ride.',
      jsonb_build_object('ride_id', v_ride.id)
    );
  end if;

  return v_ride;
end;
$$;

revoke execute on function public.mark_driver_arriving(uuid) from public;
grant execute on function public.mark_driver_arriving(uuid) to authenticated;

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

  update public.rides
  set status = 'ride_completed', completed_at = now()
  where id = p_ride_id
    and driver_id = auth.uid()
    and status = 'ride_started'
  returning * into v_ride;

  if v_ride.id is not null then
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
  end if;

  return v_ride;
end;
$$;

revoke execute on function public.complete_ride(uuid) from public;
grant execute on function public.complete_ride(uuid) to authenticated;

create or replace function public.passenger_cancel_active_ride(p_ride_id uuid, p_reason text default 'Passenger cancelled')
returns void
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

  update public.rides
  set status = 'cancelled', cancelled_by = 'passenger', cancellation_reason = p_reason
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

revoke execute on function public.passenger_cancel_active_ride(uuid, text) from public;
grant execute on function public.passenger_cancel_active_ride(uuid, text) to authenticated;

comment on function public.passenger_cancel_active_ride(uuid, text) is 'Post-acceptance passenger cancellation (accepted/driver_arriving). For pre-acceptance cancellation use passenger_cancel_matching_ride (Phase 8) instead — that one supersedes pending ride_offers, which don''t exist once a driver is already assigned.';
