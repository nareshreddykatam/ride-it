-- ============================================================================
-- 20260819090300_rating_reminder.sql
-- Phase 15. Amends complete_ride() (Phase 10 -> Phase 11 -> here) to also
-- send a one-time "rate your ride" nudge to both parties, alongside the
-- existing "ride completed" notification. Naturally fires only once —
-- the same guard that makes "ride completed" fire exactly once
-- (`status = 'ride_started'` in the WHERE clause) means this reminder
-- can never duplicate either. No separate reminder/scheduling
-- infrastructure was built — deliberately, per the brief's "do not spam
-- the user" — this is a single nudge at the moment the ride ends, not a
-- recurring prompt, and the client-side rate screens check for an
-- existing rating before ever showing the prompt again regardless.
-- ============================================================================

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
  end if;

  return v_ride;
end;
$$;
