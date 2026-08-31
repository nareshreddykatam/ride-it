-- ============================================================================
-- 20260831131821_fix_ride_completion_premature_paid.sql
--
-- ROOT CAUSE: complete_ride() unconditionally set
--   payment_status = case when payment_method in ('cash','driver_upi') then 'paid' else payment_status end
-- the instant a ride's status became 'ride_completed' — with zero
-- confirmation that money actually changed hands. This fires whenever
-- payment_method was already selected DURING the active ride (via
-- select_ride_payment_method(), on the passenger's ride/[id] screen)
-- before completion — a completely normal, common case, not an edge
-- case. Confirmed live in the previous task's testing: a driver_upi ride
-- with payment_method pre-selected showed payment_status='paid'
-- immediately on completion, before the passenger had scanned anything
-- or the driver had received anything.
--
-- This directly contradicts the genuine, already-correct confirmation
-- mechanism that already exists: confirm_direct_payment() (Phase 16) —
-- an explicit, passenger-initiated RPC, only callable once the ride has
-- actually reached a fare-final status, idempotent, that marks
-- payment_status='paid' when the passenger taps "Confirm cash payment" /
-- "Confirm Driver UPI payment" on the post-completion screen. That
-- function's own code comment already documented the CORRECT belief
-- ("complete_ride()'s auto-confirm branch... was never reachable in
-- practice") — a belief this migration makes actually true, instead of
-- merely assumed.
--
-- FIX: remove the payment_status write entirely from complete_ride().
-- Ride completion and payment completion are now genuinely separate
-- server-authoritative events, exactly as the online (Razorpay) path
-- already worked — mark_ride_payment_captured() only ever fires from a
-- verified checkout callback or a signature-verified webhook, never from
-- ride completion. Cash and driver_upi now behave identically to that:
-- payment_status stays 'pending' (its column default) until
-- confirm_direct_payment() explicitly runs.
--
-- BUSINESS-MODEL NOTE (not changed by this migration, flagged for
-- product decision): confirm_direct_payment() is passenger-initiated for
-- BOTH cash and driver_upi — the passenger, not the driver, taps
-- "confirm" for a cash payment too. This is the existing, pre-established
-- business model (Phase 16), not something invented here. A driver-side
-- "Cash received" confirmation is a legitimate alternative design some
-- ride-hailing products use, but building one now would create a SECOND,
-- parallel payment-confirmation mechanism alongside the existing
-- passenger-side one — exactly the duplicate-architecture this task
-- explicitly warns against. Left as a documented gap, not fixed here.
-- ============================================================================

create or replace function public.complete_ride(p_ride_id uuid)
returns public.rides
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

  perform public._mark_trusted_write();

  update public.rides
  set status = 'ride_completed',
      completed_at = now()
  where id = p_ride_id
    and driver_id = auth.uid()
    and status = 'ride_started'
  returning * into v_ride;

  if v_ride.id is null then
    raise exception 'Ride is not in a state that can be completed (must be ride_started and assigned to the calling driver)' using errcode = 'P0001';
  end if;

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

  perform public._qualify_referrals_for_ride(v_ride);

  return v_ride;
end;
$$;

comment on function public.complete_ride(uuid) is
  'Transitions a ride to ride_completed. Does NOT touch payment_status — ride completion and payment completion are separate server-authoritative events. For cash/driver_upi, confirm_direct_payment() is the sole path to payment_status=''paid'' (explicit, passenger-initiated, idempotent). For online, mark_ride_payment_captured() (verified checkout callback or signature-verified webhook) is the sole path. payment_status starts and remains ''pending'' at completion for every method until one of those genuine confirmation paths runs.';
