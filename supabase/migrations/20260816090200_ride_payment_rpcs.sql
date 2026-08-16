-- ============================================================================
-- 20260816090200_ride_payment_rpcs.sql
-- Phase 11. The full lifecycle of a Ride It Online ride payment, as a
-- sequence of narrowly-scoped functions. Order creation genuinely cannot
-- be a single atomic SQL operation — it requires an external HTTP call to
-- the gateway in between two database writes — so this is deliberately
-- three steps, each independently re-validating rather than trusting
-- what a prior step (or the calling Route Handler) claims:
--
--   1. create_pending_ride_payment(ride_id)
--        -> validates ownership/eligibility, re-derives amount from the
--           ride's OWN total_fare (never a parameter), inserts a
--           'created' row. Idempotent: returns an existing non-terminal
--           row if one already exists rather than creating a duplicate.
--   2. [ Route Handler calls the gateway's order-create API here ]
--   3. attach_ride_payment_order(payment_id, provider_order_id)
--        -> re-validates ownership again, fills in the gateway's order id.
--   4. [ Route Handler verifies the gateway's payment signature, or a
--        webhook arrives ]
--   5. mark_ride_payment_captured(payment_id, provider_payment_id) /
--      mark_ride_payment_failed(payment_id, provider_payment_id, reason)
--        -> the only two functions that ever set rides.payment_status.
--
-- At no point does any function accept an amount from a caller — every
-- amount that ends up in `payments` was read directly from `rides` by
-- the database itself.
-- ============================================================================

create or replace function public.create_pending_ride_payment(p_ride_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
  v_existing public.payments;
  v_payment public.payments;
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

  if v_ride.payment_method is distinct from 'online' then
    raise exception 'Ride is not set to Ride It Online payment' using errcode = 'P0001';
  end if;

  if v_ride.status not in ('ride_completed', 'payment', 'rated') then
    raise exception 'Ride is not yet eligible for payment' using errcode = 'P0001';
  end if;

  if v_ride.payment_status = 'paid' then
    raise exception 'Ride is already paid' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.payments
  where ride_id = p_ride_id and status in ('created', 'pending', 'authorized')
  order by created_at desc
  limit 1;

  if v_existing.id is not null then
    return v_existing;
  end if;

  insert into public.payments (ride_id, passenger_id, amount, currency, status)
  values (p_ride_id, auth.uid(), v_ride.total_fare, v_ride.currency, 'created')
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke execute on function public.create_pending_ride_payment(uuid) from public;
grant execute on function public.create_pending_ride_payment(uuid) to authenticated;

comment on function public.create_pending_ride_payment(uuid) is 'Step 1 of online ride payment. amount is read from rides.total_fare directly — never a parameter, never trusted from the caller.';

create or replace function public.attach_ride_payment_order(p_payment_id uuid, p_provider_order_id text)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  update public.payments
  set provider_order_id = p_provider_order_id, status = 'pending'
  where id = p_payment_id
    and passenger_id = auth.uid()
    and status = 'created'
  returning * into v_payment;

  if v_payment.id is null then
    raise exception 'Payment not found, not owned by caller, or already has an order attached' using errcode = 'P0001';
  end if;

  return v_payment;
end;
$$;

revoke execute on function public.attach_ride_payment_order(uuid, text) from public;
grant execute on function public.attach_ride_payment_order(uuid, text) to authenticated;

create or replace function public.mark_ride_payment_captured(p_payment_id uuid, p_provider_payment_id text)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
begin
  if auth.uid() is not null then
    if not exists (select 1 from public.payments where id = p_payment_id and passenger_id = auth.uid()) then
      raise exception 'Payment not found or not owned by caller' using errcode = '42501';
    end if;
  end if;

  update public.payments
  set status = 'captured', provider_payment_id = p_provider_payment_id, captured_at = now()
  where id = p_payment_id
    and status in ('created', 'pending', 'authorized')
  returning * into v_payment;

  if v_payment.id is null then
    select * into v_payment from public.payments where id = p_payment_id;
    return v_payment;
  end if;

  perform public._mark_trusted_write();
  update public.rides set payment_status = 'paid' where id = v_payment.ride_id;

  perform public._create_notification(
    v_payment.passenger_id,
    'payment_confirmation',
    'Payment successful',
    format('Your payment of ₹%s was successful.', v_payment.amount),
    jsonb_build_object('ride_id', v_payment.ride_id, 'payment_id', v_payment.id)
  );

  return v_payment;
end;
$$;

revoke execute on function public.mark_ride_payment_captured(uuid, text) from public;
grant execute on function public.mark_ride_payment_captured(uuid, text) to authenticated;
grant execute on function public.mark_ride_payment_captured(uuid, text) to service_role;

create or replace function public.mark_ride_payment_failed(p_payment_id uuid, p_provider_payment_id text, p_failure_reason text)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
begin
  if auth.uid() is not null then
    if not exists (select 1 from public.payments where id = p_payment_id and passenger_id = auth.uid()) then
      raise exception 'Payment not found or not owned by caller' using errcode = '42501';
    end if;
  end if;

  update public.payments
  set status = 'failed', provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
      failure_reason = p_failure_reason, failed_at = now()
  where id = p_payment_id
    and status in ('created', 'pending', 'authorized')
  returning * into v_payment;

  if v_payment.id is null then
    select * into v_payment from public.payments where id = p_payment_id;
    return v_payment;
  end if;

  perform public._create_notification(
    v_payment.passenger_id,
    'payment_confirmation',
    'Payment failed',
    'Your payment could not be completed. You can try again.',
    jsonb_build_object('ride_id', v_payment.ride_id, 'payment_id', v_payment.id)
  );

  return v_payment;
end;
$$;

revoke execute on function public.mark_ride_payment_failed(uuid, text, text) from public;
grant execute on function public.mark_ride_payment_failed(uuid, text, text) to authenticated;
grant execute on function public.mark_ride_payment_failed(uuid, text, text) to service_role;

create or replace function public.get_ride_payment(p_ride_id uuid)
returns public.payments
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select * into v_payment
  from public.payments
  where ride_id = p_ride_id
    and (passenger_id = auth.uid() or exists (select 1 from public.rides r where r.id = p_ride_id and r.driver_id = auth.uid()) or public.is_admin())
  order by created_at desc
  limit 1;

  return v_payment;
end;
$$;

revoke execute on function public.get_ride_payment(uuid) from public;
grant execute on function public.get_ride_payment(uuid) to authenticated;
