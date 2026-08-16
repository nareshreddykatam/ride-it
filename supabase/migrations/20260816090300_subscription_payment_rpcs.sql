-- ============================================================================
-- 20260816090300_subscription_payment_rpcs.sql
-- Phase 11. Same three-step pattern as ride payments (create pending ->
-- attach gateway order -> mark captured/failed), applied to driver
-- subscriptions. Reuses the existing subscription_payments table
-- (Phase 3/6.1) rather than creating a new one — only two columns added
-- (provider_order_id; provider_reference renamed to provider_payment_id
-- for clarity, since it was never referenced anywhere in application
-- code, confirmed by grep before renaming).
--
-- purchase_subscription_simulated() (Phase 6.1) activated the
-- subscription IMMEDIATELY and marked the payment 'paid' in the same
-- transaction — appropriate for that phase's explicit "simulated, no
-- gateway" scope. Phase 11 replaces this: a subscription now only
-- activates once mark_subscription_payment_captured() confirms real
-- payment. purchase_subscription_simulated() is dropped, not left
-- alongside the new flow, so there is exactly one subscription-purchase
-- path in the schema.
-- ============================================================================

alter table public.subscription_payments rename column provider_reference to provider_payment_id;
alter table public.subscription_payments add column provider_order_id text;

drop function if exists public.purchase_subscription_simulated(public.subscription_plan_enum);

create or replace function public.create_pending_subscription_payment(p_plan public.subscription_plan_enum)
returns public.subscription_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(10, 2);
  v_duration_days integer;
  v_existing public.subscription_payments;
  v_subscription_id uuid;
  v_payment public.subscription_payments;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.drivers where id = auth.uid()) then
    raise exception 'Caller is not a registered driver' using errcode = '42501';
  end if;

  select amount, duration_days into v_amount, v_duration_days
  from public.subscription_plans
  where plan = p_plan and is_active = true;

  if v_amount is null then
    raise exception 'Invalid or inactive plan: %', p_plan using errcode = '22023';
  end if;

  select sp.* into v_existing
  from public.subscription_payments sp
  where sp.driver_id = auth.uid() and sp.status = 'pending' and sp.provider != 'simulated'
  order by sp.created_at desc
  limit 1;

  if v_existing.id is not null then
    return v_existing;
  end if;

  -- Placeholder subscription row — subscription_id is NOT NULL on
  -- subscription_payments (Phase 3), so a row must exist before the
  -- payment row can reference it. Created already-'expired' and inert;
  -- mark_subscription_payment_captured is the only function that ever
  -- flips it to 'active' with real dates. expires_at must be strictly
  -- after starts_at (existing CHECK constraint) — the exact placeholder
  -- gap is irrelevant since this row is never active until captured.
  insert into public.subscriptions (driver_id, plan, status, amount, starts_at, expires_at)
  values (auth.uid(), p_plan, 'expired', v_amount, now(), now() + interval '1 second')
  returning id into v_subscription_id;

  insert into public.subscription_payments (subscription_id, driver_id, amount, currency, status, payment_method, provider)
  values (v_subscription_id, auth.uid(), v_amount, 'INR', 'pending', 'online', 'razorpay')
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke execute on function public.create_pending_subscription_payment(public.subscription_plan_enum) from public;
grant execute on function public.create_pending_subscription_payment(public.subscription_plan_enum) to authenticated;

comment on function public.create_pending_subscription_payment(public.subscription_plan_enum) is 'Step 1 of a real subscription purchase. amount/duration are read from subscription_plans, never a parameter. The linked subscriptions row starts life already-expired/inert and is only activated by mark_subscription_payment_captured on confirmed payment — never merely because checkout returned success.';

create or replace function public.attach_subscription_payment_order(p_payment_id uuid, p_provider_order_id text)
returns public.subscription_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.subscription_payments;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  update public.subscription_payments
  set provider_order_id = p_provider_order_id
  where id = p_payment_id
    and driver_id = auth.uid()
    and status = 'pending'
    and provider_order_id is null
  returning * into v_payment;

  if v_payment.id is null then
    raise exception 'Payment not found, not owned by caller, or already has an order attached' using errcode = 'P0001';
  end if;

  return v_payment;
end;
$$;

revoke execute on function public.attach_subscription_payment_order(uuid, text) from public;
grant execute on function public.attach_subscription_payment_order(uuid, text) to authenticated;

create or replace function public.mark_subscription_payment_captured(p_payment_id uuid, p_provider_payment_id text)
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
  where id = p_payment_id and status = 'pending'
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

revoke execute on function public.mark_subscription_payment_captured(uuid, text) from public;
grant execute on function public.mark_subscription_payment_captured(uuid, text) to authenticated;
grant execute on function public.mark_subscription_payment_captured(uuid, text) to service_role;

comment on function public.mark_subscription_payment_captured(uuid, text) is 'The ONLY path that activates a driver subscription — never merely because a checkout page said success. Idempotent: a second call against an already-paid row is a no-op read.';

create or replace function public.mark_subscription_payment_failed(p_payment_id uuid, p_provider_payment_id text, p_failure_reason text)
returns public.subscription_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.subscription_payments;
begin
  if auth.uid() is not null then
    if not exists (select 1 from public.subscription_payments where id = p_payment_id and driver_id = auth.uid()) then
      raise exception 'Payment not found or not owned by caller' using errcode = '42501';
    end if;
  end if;

  update public.subscription_payments
  set status = 'failed', provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id)
  where id = p_payment_id and status = 'pending'
  returning * into v_payment;

  if v_payment.id is null then
    select * into v_payment from public.subscription_payments where id = p_payment_id;
    return v_payment;
  end if;

  perform public._create_notification(
    v_payment.driver_id,
    'subscription',
    'Subscription payment failed',
    coalesce(p_failure_reason, 'Your subscription payment could not be completed. You can try again.'),
    jsonb_build_object('subscription_id', v_payment.subscription_id)
  );

  return v_payment;
end;
$$;

revoke execute on function public.mark_subscription_payment_failed(uuid, text, text) from public;
grant execute on function public.mark_subscription_payment_failed(uuid, text, text) to authenticated;
grant execute on function public.mark_subscription_payment_failed(uuid, text, text) to service_role;
