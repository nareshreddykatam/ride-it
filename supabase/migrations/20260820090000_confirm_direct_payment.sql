-- ============================================================================
-- 20260820090000_confirm_direct_payment.sql
-- Phase 16. REAL BUG FOUND by a full local end-to-end lifecycle test that
-- traced the exact RPC/REST sequence the Passenger and Driver apps
-- actually call (create ride -> match -> accept -> Ride PIN -> complete
-- -> choose payment method -> rate) — not caught by any prior phase's
-- review, because no prior phase executed the ENTIRE sequence in the
-- real order the UI performs it.
--
-- complete_ride() (Phase 10 -> 11 -> 15) auto-confirms payment_status =
-- 'paid' for cash/driver_upi rides, but only by checking
-- rides.payment_method AT THE MOMENT IT RUNS — which is when the DRIVER
-- taps "Complete ride" on the Navigation screen. The Passenger app's own
-- payment-method selection screen
-- (apps/passenger/app/ride/[id]/complete/page.tsx) only appears AFTER
-- the ride reaches ride_completed, and its own comment
-- ("payment_status is marked 'paid' server-side automatically when the
-- ride completes... nothing further to confirm here") incorrectly
-- assumed complete_ride() would see the already-chosen method. In every
-- real usage, payment_method is still null when complete_ride() runs,
-- so its cash/driver_upi branch never actually fires — payment_status
-- stays 'pending' forever for every cash/driver_upi ride. Confirmed via
-- a real local test: a ride was taken through the full lifecycle with
-- payment_method chosen only after completion (matching the real UI
-- order), and payment_status remained 'pending' despite the ride being
-- genuinely complete and the passenger having "confirmed" cash payment
-- in the UI.
--
-- Fix: a new, narrowly-scoped RPC for exactly this one case — confirming
-- a direct (cash/driver_upi) payment after the ride has already
-- completed. Does NOT touch the 'online' payment method at all (that
-- flow's own create_pending_ride_payment/mark_ride_payment_captured
-- chain, Phase 11, was independently verified working correctly this
-- phase and needed no change). Does NOT weaken
-- protect_ride_financial_columns — payment_status remains fully
-- unwritable by any direct client update; this function is simply
-- another correctly-scoped trusted-write path alongside the existing
-- ones, exactly the established pattern.
-- ============================================================================

create or replace function public.confirm_direct_payment(p_ride_id uuid, p_method public.payment_method_enum)
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

  if p_method not in ('cash', 'driver_upi') then
    raise exception 'confirm_direct_payment only accepts cash or driver_upi — use the online payment flow for online' using errcode = '22023';
  end if;

  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if v_ride.passenger_id is distinct from auth.uid() then
    raise exception 'Caller does not own this ride' using errcode = '42501';
  end if;

  if v_ride.status not in ('ride_completed', 'payment', 'rated') then
    raise exception 'Ride is not yet completed' using errcode = 'P0001';
  end if;

  if v_ride.payment_status = 'paid' then
    return v_ride;
  end if;

  perform public._mark_trusted_write();

  update public.rides
  set payment_method = p_method, payment_status = 'paid'
  where id = p_ride_id
  returning * into v_ride;

  perform public._create_notification(
    v_ride.driver_id,
    'payment_confirmation',
    'Payment confirmed',
    format('Passenger confirmed %s payment for this ride.', p_method),
    jsonb_build_object('ride_id', p_ride_id)
  );

  return v_ride;
end;
$$;

revoke execute on function public.confirm_direct_payment(uuid, public.payment_method_enum) from public;
grant execute on function public.confirm_direct_payment(uuid, public.payment_method_enum) to authenticated;

comment on function public.confirm_direct_payment(uuid, public.payment_method_enum) is 'Phase 16 fix — the actual path that marks a cash/driver_upi ride paid, called from the Passenger ride-complete screen after the ride has already ended. complete_ride()''s own cash/driver_upi branch (Phase 11) is left in place unchanged (harmless no-op safety net in the real flow, not removed).';
