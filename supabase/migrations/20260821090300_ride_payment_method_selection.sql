-- ============================================================================
-- 20260821090300_ride_payment_method_selection.sql
--
-- New RPC: select_ride_payment_method(). Moves the payment-method DECISION
-- to the post-acceptance stage (Phase E), while leaving the existing
-- post-completion SETTLEMENT paths (confirm_direct_payment(),
-- create_pending_ride_payment()/Razorpay checkout) completely unchanged --
-- this RPC only ever writes rides.payment_method, never payment_status or
-- any financial column (those remain protected by the existing
-- protect_ride_financial_columns trigger, untouched here).
--
-- Server-authoritative: validates the caller is genuinely this ride's
-- passenger, a driver is actually assigned, the ride is in an active
-- (non-terminal, driver-assigned) state, and -- critically -- that the
-- assigned driver has actually opted into the requested method
-- (drivers.accepts_cash/accepts_driver_upi/accepts_online, added in
-- 20260821090200) before allowing the write. A passenger can never select
-- a method the driver hasn't enabled, and a driver can never be forced
-- into a method they didn't opt into -- both enforced here, not trusted
-- from the client.
-- ============================================================================

create or replace function public.select_ride_payment_method(p_ride_id uuid, p_method public.payment_method_enum)
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

  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if v_ride.passenger_id is distinct from auth.uid() then
    raise exception 'Caller is not the passenger for this ride' using errcode = '42501';
  end if;

  if v_ride.driver_id is null then
    raise exception 'No driver assigned to this ride yet' using errcode = 'P0001';
  end if;

  if v_ride.status not in ('accepted', 'driver_arriving', 'ride_started') then
    raise exception 'Payment method can only be chosen while the ride is active' using errcode = 'P0001';
  end if;

  select * into v_driver from public.drivers where id = v_ride.driver_id;

  if p_method = 'cash' and not v_driver.accepts_cash then
    raise exception 'This driver does not accept cash payment' using errcode = 'P0001';
  elsif p_method = 'driver_upi' and not (v_driver.accepts_driver_upi and v_driver.upi_verified) then
    raise exception 'This driver does not accept UPI payment, or their UPI ID is not yet verified' using errcode = 'P0001';
  elsif p_method = 'online' and not v_driver.accepts_online then
    raise exception 'This driver does not accept online payment' using errcode = 'P0001';
  end if;

  update public.rides
  set payment_method = p_method
  where id = p_ride_id
  returning * into v_ride;

  return v_ride;
end;
$$;

comment on function public.select_ride_payment_method(uuid, public.payment_method_enum) is
  'Passenger-only: chooses the payment method for an active ride, validated server-side against the assigned driver''s actual accepts_cash/accepts_driver_upi/accepts_online preferences (and upi_verified for driver_upi). Only writes payment_method -- payment_status and all financial columns remain governed by the existing confirm_direct_payment()/Razorpay RPC chain at settlement time, unchanged by this migration.';

revoke execute on function public.select_ride_payment_method(uuid, public.payment_method_enum) from public;
grant execute on function public.select_ride_payment_method(uuid, public.payment_method_enum) to authenticated;
