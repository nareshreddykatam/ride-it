-- ============================================================================
-- 20260902100100_ride_completion_flow_rpcs.sql
--
-- Implements the driver-controlled end-of-ride sequence:
--   ride_started
--     -> driver_mark_arrived_at_destination()   -> destination_reached
--     -> driver_select_payment_method()          (payment_method only, no status change)
--     -> driver_confirm_payment_received()       -> payment_collected (payment_status='paid')
--     -> complete_ride() [extended, see below]   -> ride_completed
--
-- Ownership of payment-method selection and payment-received confirmation
-- moves from the passenger (select_ride_payment_method(),
-- confirm_direct_payment() — both Phase 16/21) to the driver, matching the
-- product decision that the driver is the one physically collecting cash
-- or showing a UPI QR. Both superseded functions are left in the database
-- (not dropped — no destructive DDL for functions other code might still
-- reference in a rollback scenario) but their EXECUTE grant is revoked
-- from authenticated below, so neither is callable by a client anymore.
-- The passenger's one remaining legitimate payment action — paying online
-- via Razorpay themselves — gets its own narrow replacement RPC
-- (passenger_select_online_payment_method) for the exact same reason
-- select_ride_payment_method is being revoked: payment_method was
-- previously writable via a raw, unprotected client .update() call
-- (packages/data/src/rides.ts's setRidePaymentMethod()), which this
-- migration also closes by adding payment_method to
-- protect_ride_financial_columns' guarded column list.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- driver_mark_arrived_at_destination(): the sole path from ride_started to
-- destination_reached. Same shape as complete_ride()/verify_ride_pin_and_start()
-- — trusted write, driver-owned, raises (never silently no-ops) on a
-- mismatched ride/status/driver.
-- ----------------------------------------------------------------------------
create or replace function public.driver_mark_arrived_at_destination(p_ride_id uuid)
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
  set status = 'destination_reached',
      destination_reached_at = now()
  where id = p_ride_id
    and driver_id = auth.uid()
    and status = 'ride_started'
  returning * into v_ride;

  if v_ride.id is null then
    raise exception 'Ride is not in a state that can be marked arrived (must be ride_started and assigned to the calling driver)' using errcode = 'P0001';
  end if;

  perform public._create_notification(
    v_ride.passenger_id,
    'ride_status',
    'Driver has reached your destination',
    'Your final fare is ready.',
    jsonb_build_object('ride_id', v_ride.id)
  );

  return v_ride;
end;
$$;

revoke execute on function public.driver_mark_arrived_at_destination(uuid) from public;
grant execute on function public.driver_mark_arrived_at_destination(uuid) to authenticated;

comment on function public.driver_mark_arrived_at_destination(uuid) is 'Driver-only: confirms arrival at the destination. Sole path from ride_started to destination_reached — see protect_ride_flow_transitions for the trigger that blocks any direct client write to this status.';

-- ----------------------------------------------------------------------------
-- driver_select_payment_method(): moves payment-method selection to the
-- driver, at the destination_reached stage only. Mirrors
-- select_ride_payment_method()'s validation (a driver can't select a
-- method they haven't themselves opted into / verified) but authorizes
-- the DRIVER instead of the passenger, and only ever writes
-- payment_method — payment_status and every fare column remain governed
-- by protect_ride_financial_columns, unchanged by this function.
-- Deliberately cash/driver_upi only: this RPC is for the driver-collected
-- flow; passenger self-service online payment has its own separate RPC
-- below and its own separate screen (post-completion), unaffected.
-- ----------------------------------------------------------------------------
create or replace function public.driver_select_payment_method(p_ride_id uuid, p_method public.payment_method_enum)
returns public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
  v_driver public.drivers;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if p_method not in ('cash', 'driver_upi') then
    raise exception 'driver_select_payment_method only accepts cash or driver_upi' using errcode = '22023';
  end if;

  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if v_ride.driver_id is distinct from auth.uid() then
    raise exception 'Caller is not the assigned driver for this ride' using errcode = '42501';
  end if;

  if v_ride.status is distinct from 'destination_reached' then
    raise exception 'Payment method can only be chosen after confirming arrival' using errcode = 'P0001';
  end if;

  select * into v_driver from public.drivers where id = auth.uid();

  if p_method = 'cash' and not v_driver.accepts_cash then
    raise exception 'You have not enabled Cash in Payment settings' using errcode = 'P0001';
  elsif p_method = 'driver_upi' and not (v_driver.accepts_driver_upi and v_driver.upi_verified) then
    raise exception 'You have not enabled a verified UPI ID in Payment settings' using errcode = 'P0001';
  end if;

  perform public._mark_trusted_write();

  update public.rides
  set payment_method = p_method
  where id = p_ride_id
  returning * into v_ride;

  return v_ride;
end;
$$;

revoke execute on function public.driver_select_payment_method(uuid, public.payment_method_enum) from public;
grant execute on function public.driver_select_payment_method(uuid, public.payment_method_enum) to authenticated;

comment on function public.driver_select_payment_method(uuid, public.payment_method_enum) is 'Driver-only: chooses Cash or Driver UPI for a ride at the destination_reached stage, validated against the calling driver''s own accepts_cash/accepts_driver_upi+upi_verified settings. Supersedes select_ride_payment_method (now revoked from authenticated) for this flow.';

-- ----------------------------------------------------------------------------
-- driver_confirm_payment_received(): the sole path that marks a
-- cash/driver_upi ride's payment_status='paid' before completion. Driver-
-- initiated (supersedes confirm_direct_payment, which was passenger-
-- initiated and only ever ran post-completion — now revoked from
-- authenticated). Idempotent: a second call after the first already
-- succeeded returns the same row rather than raising, so a duplicate
-- tap/slide can never double-write or corrupt state.
-- ----------------------------------------------------------------------------
create or replace function public.driver_confirm_payment_received(p_ride_id uuid)
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

  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if v_ride.driver_id is distinct from auth.uid() then
    raise exception 'Caller is not the assigned driver for this ride' using errcode = '42501';
  end if;

  -- Idempotent no-op: this driver already confirmed this exact payment.
  if v_ride.status = 'payment_collected' and v_ride.payment_status = 'paid' then
    return v_ride;
  end if;

  if v_ride.status is distinct from 'destination_reached' then
    raise exception 'Payment can only be confirmed after arrival, and before it has already been confirmed' using errcode = 'P0001';
  end if;

  if v_ride.payment_method is null or v_ride.payment_method not in ('cash', 'driver_upi') then
    raise exception 'Select a payment method before confirming payment received' using errcode = 'P0001';
  end if;

  perform public._mark_trusted_write();

  update public.rides
  set status = 'payment_collected',
      payment_status = 'paid'
  where id = p_ride_id
    and driver_id = auth.uid()
    and status = 'destination_reached'
  returning * into v_ride;

  if v_ride.id is null then
    raise exception 'Payment could not be confirmed — the ride state changed, try again' using errcode = 'P0001';
  end if;

  perform public._create_notification(
    v_ride.passenger_id,
    'payment_confirmation',
    'Payment collected',
    format('Your driver confirmed %s payment of ₹%s.', v_ride.payment_method, v_ride.total_fare),
    jsonb_build_object('ride_id', p_ride_id)
  );

  return v_ride;
end;
$$;

revoke execute on function public.driver_confirm_payment_received(uuid) from public;
grant execute on function public.driver_confirm_payment_received(uuid) to authenticated;

comment on function public.driver_confirm_payment_received(uuid) is 'Driver-only, idempotent: confirms actual receipt of a cash/driver_upi payment. Sole path from destination_reached to payment_collected. Requires payment_method already selected. Supersedes confirm_direct_payment (now revoked from authenticated) for this flow.';

-- ----------------------------------------------------------------------------
-- complete_ride(): extended (not replaced in spirit) to also accept
-- payment_collected as a valid FROM status, alongside the existing
-- ride_started path. The ride_started path is kept for backward
-- compatibility — any ride already in progress at deploy time, and the
-- existing online (Razorpay) flow, which settles payment independently
-- and after completion via mark_ride_payment_captured() (verified
-- checkout callback / signature-verified webhook), both continue to work
-- completely unchanged. A ride that went through the new
-- destination_reached -> payment_collected path can now ALSO only
-- complete once payment_status is genuinely 'paid' for that path,
-- enforced by the WHERE clause itself (status = 'payment_collected'
-- only reachable with payment_status already 'paid' — see
-- driver_confirm_payment_received above).
-- ----------------------------------------------------------------------------
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
      completed_at = now()
  where id = p_ride_id
    and driver_id = auth.uid()
    and status in ('ride_started', 'payment_collected')
  returning * into v_ride;

  if v_ride.id is null then
    raise exception 'Ride is not in a state that can be completed (must be ride_started or payment_collected, and assigned to the calling driver)' using errcode = 'P0001';
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

comment on function public.complete_ride(uuid) is 'Transitions a ride to ride_completed from either ride_started (legacy/online-payment path, unchanged) or payment_collected (new driver-confirmed cash/driver_upi path — payment_status is already ''paid'' by construction on this path). Does not itself touch payment_status. Raises P0001 (never a silent no-op) on a non-matching ride/status/driver.';

-- ----------------------------------------------------------------------------
-- passenger_select_online_payment_method(): the passenger's one remaining
-- legitimate payment-method action — choosing to pay online themselves,
-- post-completion, via the existing Razorpay checkout flow. Replaces the
-- previous raw, unprotected `.update({ payment_method: 'online' })` client
-- call (packages/data/src/rides.ts's setRidePaymentMethod, called from
-- apps/passenger/app/ride/[id]/complete/page.tsx) now that payment_method
-- is a protected column (see protect_ride_financial_columns below) —
-- without this replacement, the existing "Pay online" feature would break.
-- ----------------------------------------------------------------------------
create or replace function public.passenger_select_online_payment_method(p_ride_id uuid)
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
    raise exception 'This ride has already been paid for' using errcode = 'P0001';
  end if;

  perform public._mark_trusted_write();

  update public.rides
  set payment_method = 'online'
  where id = p_ride_id
  returning * into v_ride;

  return v_ride;
end;
$$;

revoke execute on function public.passenger_select_online_payment_method(uuid) from public;
grant execute on function public.passenger_select_online_payment_method(uuid) to authenticated;

comment on function public.passenger_select_online_payment_method(uuid) is 'Passenger-only: sets payment_method=''online'' on an already-completed, not-yet-paid ride, immediately before starting Razorpay checkout. The only passenger-writable payment_method path remaining — cash/driver_upi selection is exclusively driver_select_payment_method() now.';

-- ----------------------------------------------------------------------------
-- protect_ride_flow_transitions(): the same pattern as the existing
-- protect_ride_start_transition (20260815090100) and
-- protect_ride_completion_transition (20260831093000) triggers, extended
-- to the two new statuses this migration introduces. Without this, the
-- broad row-level rides_update_driver RLS policy (driver_id = auth.uid(),
-- no status restriction) would let a driver PATCH status directly to
-- destination_reached or payment_collected via a raw client update,
-- bypassing driver_mark_arrived_at_destination()'s/
-- driver_confirm_payment_received()'s own preconditions entirely (in
-- particular, reaching payment_collected — and therefore completion, per
-- complete_ride()'s new WHERE clause — without payment_status ever
-- actually being set to 'paid').
-- ----------------------------------------------------------------------------
create or replace function public.protect_ride_flow_transitions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('destination_reached', 'payment_collected') and old.status is distinct from new.status then
    if coalesce(current_setting('ride_it.trusted_write', true), 'false') != 'true' and not public.is_admin() then
      raise exception 'A ride can only reach % through its own RPC', new.status using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_ride_flow_transitions on public.rides;
create trigger protect_ride_flow_transitions
  before update on public.rides
  for each row execute function public.protect_ride_flow_transitions();

comment on function public.protect_ride_flow_transitions() is 'Blocks any direct (non-trusted-write, non-admin) transition of rides.status into destination_reached or payment_collected — same pattern as protect_ride_completion_transition, for the two new pre-completion statuses.';

-- ----------------------------------------------------------------------------
-- protect_ride_financial_columns(): extended to also guard payment_method,
-- which was previously (and deliberately, per its own prior comment)
-- unprotected — "selecting a payment method is a normal passenger action"
-- was true when select_ride_payment_method() was itself the only path a
-- legitimate client used, but a raw client update could always bypass
-- that RPC's driver-opt-in validation entirely, since nothing at the
-- column level stopped it. Now that payment_method selection is a
-- narrowly-scoped, driver- or passenger-owned RPC action (see above), the
-- column deserves the same protection as payment_status and every fare
-- column.
-- ----------------------------------------------------------------------------
create or replace function public.protect_ride_financial_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('ride_it.trusted_write', true), 'false') = 'true'
     or public.is_admin() then
    return new;
  end if;

  if new.payment_status is distinct from old.payment_status
     or new.payment_method is distinct from old.payment_method
     or new.base_fare is distinct from old.base_fare
     or new.distance_fare is distinct from old.distance_fare
     or new.total_fare is distinct from old.total_fare
     or new.discount_amount is distinct from old.discount_amount
  then
    raise exception 'Cannot modify ride financial fields directly' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.protect_ride_financial_columns() is 'Blocks direct passenger/driver modification of payment_status, payment_method, and every fare column — closes the real gap where either party''s broad row-level RLS would otherwise let a direct client UPDATE set an unvalidated payment_method, mark their own ride paid, or rewrite the fare. payment_method is writable only via driver_select_payment_method()/passenger_select_online_payment_method(), both trusted writes.';

-- ----------------------------------------------------------------------------
-- Revoke client access to the two superseded passenger-side payment RPCs.
-- Neither function is dropped (no destructive DDL) — just made
-- unreachable from a client session, same as _mark_trusted_write()'s own
-- access model.
-- ----------------------------------------------------------------------------
revoke execute on function public.select_ride_payment_method(uuid, public.payment_method_enum) from authenticated;
revoke execute on function public.confirm_direct_payment(uuid, public.payment_method_enum) from authenticated;

comment on function public.select_ride_payment_method(uuid, public.payment_method_enum) is 'SUPERSEDED as of 20260902100100 by driver_select_payment_method() — payment-method selection moved to the driver. EXECUTE revoked from authenticated; kept only for historical/audit reference, not dropped.';
comment on function public.confirm_direct_payment(uuid, public.payment_method_enum) is 'SUPERSEDED as of 20260902100100 by driver_confirm_payment_received() — payment confirmation moved to the driver. EXECUTE revoked from authenticated; kept only for historical/audit reference, not dropped.';
