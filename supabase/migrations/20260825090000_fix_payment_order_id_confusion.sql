-- ============================================================================
-- 20260825090000_fix_payment_order_id_confusion.sql
--
-- REAL VULNERABILITY FOUND, not introduced this phase: mark_ride_payment_captured
-- (20260816090200) and mark_subscription_payment_captured (20260816090300)
-- accept a `p_payment_id` (which row to mark captured) and a
-- `p_provider_payment_id` (Razorpay's payment id, stored for reference)
-- but never verify that the CALLER-SUPPLIED order id actually matches the
-- order id that was originally attached to that specific payment row.
--
-- The client-facing verify Route Handlers
-- (apps/passenger/app/api/payments/verify/route.ts,
-- apps/driver/app/api/payments/subscription/verify/route.ts) DO verify
-- the Razorpay signature over (order_id, payment_id) before calling these
-- RPCs -- correctly proving the caller genuinely completed a real payment
-- for THAT order/payment pair. What was missing: nothing then confirmed
-- that pair actually belongs to the `payment_id` the caller also passed.
--
-- Concrete exploit: a passenger with two of their own online-payment
-- rides -- Ride A (expensive) and Ride B (cheap) -- creates pending
-- payments and real Razorpay orders for both, then genuinely pays only
-- for Ride B. They now hold a real, validly-signed
-- (order_B, payment_B, signature_B) triple. Calling
-- POST /api/payments/verify with { paymentId: payment_A.id,
-- providerOrderId: order_B, providerPaymentId: payment_B,
-- signature: signature_B } passes signature verification (the signature
-- IS valid for order_B/payment_B), and the old mark_ride_payment_captured
-- had no way to notice that order_B was never attached to payment_A --
-- it would mark Ride A's payment captured and rides.payment_status='paid'
-- for the full, unpaid fare. Exactly the "verify another order" /
-- "mismatched order ID" attack class.
--
-- The webhook path (process_payment_webhook_event) was NOT vulnerable to
-- this -- it looks up the payment row BY provider_order_id from Razorpay's
-- own payload in the first place, so payment_id and order_id are already
-- correlated by construction there. Only the client-submitted immediate-
-- verification path had the gap. Fixed at the RPC layer anyway (not just
-- the Route Handler) so the guarantee holds regardless of caller, matching
-- this schema's existing "re-validate, don't trust a prior step" pattern
-- (see create_pending_ride_payment's own header comment).
--
-- Both functions gain a required p_provider_order_id parameter and reject
-- (silently, returning the unchanged current row -- same idiom already
-- used for "already processed") any mismatch against the payment row's
-- own stored provider_order_id. Parameter count changes, so CREATE OR
-- REPLACE cannot reuse the old signature -- DROP + CREATE, then re-grant
-- (a DROP clears prior grants; this exact trap already documented in
-- 20260821090400_fix_set_ride_pin_execute_grant.sql).
-- ============================================================================

drop function if exists public.mark_ride_payment_captured(uuid, text);

create or replace function public.mark_ride_payment_captured(
  p_payment_id uuid,
  p_provider_payment_id text,
  p_provider_order_id text
)
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
    and provider_order_id = p_provider_order_id
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

revoke execute on function public.mark_ride_payment_captured(uuid, text, text) from public;
grant execute on function public.mark_ride_payment_captured(uuid, text, text) to authenticated;
grant execute on function public.mark_ride_payment_captured(uuid, text, text) to service_role;

comment on function public.mark_ride_payment_captured(uuid, text, text) is
  'Marks a ride payment captured. p_provider_order_id must match the order already attached to p_payment_id (via attach_ride_payment_order) -- closes a cross-order/payment confusion vulnerability where a caller could verify a real payment for one order against a different, more expensive ride''s payment row. A mismatch is treated identically to "already processed": the unchanged current row is returned, no error, no state change.';

drop function if exists public.mark_subscription_payment_captured(uuid, text);

create or replace function public.mark_subscription_payment_captured(
  p_payment_id uuid,
  p_provider_payment_id text,
  p_provider_order_id text
)
returns public.subscription_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.subscription_payments;
  v_plan record;
  v_starts_at timestamptz := now();
begin
  if auth.uid() is not null then
    if not exists (select 1 from public.subscription_payments where id = p_payment_id and driver_id = auth.uid()) then
      raise exception 'Payment not found or not owned by caller' using errcode = '42501';
    end if;
  end if;

  update public.subscription_payments
  set status = 'paid', provider_payment_id = p_provider_payment_id, paid_at = now()
  where id = p_payment_id
    and status = 'pending'
    and provider_order_id = p_provider_order_id
  returning * into v_payment;

  if v_payment.id is null then
    select * into v_payment from public.subscription_payments where id = p_payment_id;
    return v_payment;
  end if;

  select s.plan, sp.duration_days into v_plan
  from public.subscriptions s
  join public.subscription_plans sp on sp.plan = s.plan
  where s.id = v_payment.subscription_id;

  update public.subscriptions
  set status = 'expired'
  where driver_id = v_payment.driver_id and status = 'active' and id != v_payment.subscription_id;

  update public.subscriptions
  set status = 'active', starts_at = v_starts_at, expires_at = v_starts_at + (v_plan.duration_days || ' days')::interval
  where id = v_payment.subscription_id;

  perform public._create_notification(
    v_payment.driver_id,
    'subscription',
    'Subscription activated',
    format('Your %s subscription is now active.', v_plan.plan),
    jsonb_build_object('subscription_id', v_payment.subscription_id)
  );

  return v_payment;
end;
$$;

revoke execute on function public.mark_subscription_payment_captured(uuid, text, text) from public;
grant execute on function public.mark_subscription_payment_captured(uuid, text, text) to authenticated;
grant execute on function public.mark_subscription_payment_captured(uuid, text, text) to service_role;

comment on function public.mark_subscription_payment_captured(uuid, text, text) is
  'The ONLY path that activates a driver subscription. p_provider_order_id must match the order already attached to p_payment_id -- same cross-order/payment confusion fix as mark_ride_payment_captured. Idempotent: a mismatched or already-paid row is returned unchanged.';

-- ----------------------------------------------------------------------------
-- process_payment_webhook_event: signature unchanged (still 7 params), only
-- its body updated to pass the order id it already looked the payment up
-- by through to the now-3-arg captured functions. This path was never
-- vulnerable to the confusion above (see header), but must be updated to
-- keep calling the new function signatures at all.
-- ----------------------------------------------------------------------------
create or replace function public.process_payment_webhook_event(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_status text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted_id uuid;
  v_ride_payment_id uuid;
  v_subscription_payment_id uuid;
begin
  insert into public.payment_webhook_events (provider, provider_event_id, event_type, payload, processed_at)
  values (p_provider, p_provider_event_id, p_event_type, p_payload, now())
  on conflict (provider, provider_event_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    return;
  end if;

  select id into v_ride_payment_id
  from public.payments
  where provider = p_provider and provider_order_id = p_provider_order_id
  limit 1;

  if v_ride_payment_id is not null then
    if p_status = 'captured' then
      perform public.mark_ride_payment_captured(v_ride_payment_id, p_provider_payment_id, p_provider_order_id);
    elsif p_status in ('failed', 'cancelled') then
      perform public.mark_ride_payment_failed(v_ride_payment_id, p_provider_payment_id, p_event_type);
    end if;
    return;
  end if;

  select id into v_subscription_payment_id
  from public.subscription_payments
  where provider = p_provider and provider_order_id = p_provider_order_id
  limit 1;

  if v_subscription_payment_id is not null then
    if p_status = 'captured' then
      perform public.mark_subscription_payment_captured(v_subscription_payment_id, p_provider_payment_id, p_provider_order_id);
    elsif p_status in ('failed', 'cancelled') then
      perform public.mark_subscription_payment_failed(v_subscription_payment_id, p_provider_payment_id, p_event_type);
    end if;
  end if;
end;
$$;

revoke execute on function public.process_payment_webhook_event(text, text, text, text, text, text, jsonb) from public;
revoke execute on function public.process_payment_webhook_event(text, text, text, text, text, text, jsonb) from authenticated;
grant execute on function public.process_payment_webhook_event(text, text, text, text, text, text, jsonb) to service_role;
