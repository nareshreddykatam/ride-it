-- ============================================================================
-- 20260914091300_food_payment_rpcs.sql
-- Ridora Food Phase 1. Food order online-payment lifecycle, structurally
-- identical to the ride payment RPCs — same three-step flow (create
-- pending -> attach gateway order -> mark captured/failed), same "amount
-- always re-derived server-side, never a parameter" rule.
--
-- IMPORTANT: this migration was written against the CURRENT, already-
-- hardened production shape of the ride/subscription payment RPCs
-- (20260825090000_fix_payment_order_id_confusion.sql +
-- 20260910140000_phase1_audit_payment_matching_and_idor_fixes.sql section
-- 1), not the earlier, since-patched 20260816090200 version — i.e. the
-- capture/failure functions take a required p_provider_order_id and
-- verify it matches the order already attached to that payment row
-- (closes the cross-order/payment confusion class), AND are service_role
-- only (no EXECUTE for `authenticated` at all) — a browser session can
-- create a pending payment and attach a gateway order id for its own
-- order, but can never itself assert "this succeeded"; only a Route
-- Handler holding the service-role client, after independently verifying
-- the gateway signature, can call these. The unique
-- (provider, provider_order_id) indexes mirror AUDIT-001's fix so a
-- gateway order id can never back more than one payment row.
--
-- process_payment_webhook_event (existing, ride+subscription) is
-- CREATE OR REPLACE'd to add two more domains it dispatches to —
-- food_order_payments and restaurant_subscription_payments — keeping the
-- "one webhook endpoint serves every payment domain" architecture rather
-- than standing up a second endpoint/table pair. The two existing branches
-- are preserved verbatim (still 3-arg captured calls).
-- ============================================================================

create or replace function public.create_pending_food_order_payment(p_order_id uuid)
returns public.food_order_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.food_orders;
  v_existing public.food_order_payments;
  v_payment public.food_order_payments;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select * into v_order from public.food_orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.passenger_id is distinct from auth.uid() then
    raise exception 'Caller does not own this order' using errcode = '42501';
  end if;

  if v_order.payment_method is distinct from 'online' then
    raise exception 'Order is not set to online payment' using errcode = 'P0001';
  end if;

  if v_order.payment_status = 'paid' then
    raise exception 'Order is already paid' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.food_order_payments
  where order_id = p_order_id and status in ('created', 'pending', 'authorized')
  order by created_at desc
  limit 1;

  if v_existing.id is not null then
    return v_existing;
  end if;

  insert into public.food_order_payments (order_id, passenger_id, amount, currency, status)
  values (p_order_id, auth.uid(), v_order.total_amount, v_order.currency, 'created')
  returning * into v_payment;

  return v_payment;
end;
$$;

comment on function public.create_pending_food_order_payment(uuid) is 'Step 1 of online food order payment. amount is read from food_orders.total_amount directly — never a parameter.';

revoke execute on function public.create_pending_food_order_payment(uuid) from public;
grant execute on function public.create_pending_food_order_payment(uuid) to authenticated;

create or replace function public.attach_food_order_payment_order(p_payment_id uuid, p_provider_order_id text)
returns public.food_order_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.food_order_payments;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  update public.food_order_payments
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

revoke execute on function public.attach_food_order_payment_order(uuid, text) from public;
grant execute on function public.attach_food_order_payment_order(uuid, text) to authenticated;

create unique index if not exists food_order_payments_provider_order_unique
  on public.food_order_payments (provider, provider_order_id)
  where provider_order_id is not null;

-- ----------------------------------------------------------------------------
-- mark_food_order_payment_captured/failed — service_role ONLY (matching
-- AUDIT-001/004's fix: capture is the step that asserts money moved, and
-- has no legitimate caller holding a browser session — only a Route
-- Handler that has already verified the gateway's signature). p_provider_
-- order_id must match the order already attached to p_payment_id, or the
-- call is a no-op that returns the unchanged current row — same
-- cross-order/payment confusion fix as mark_ride_payment_captured
-- (20260825090000).
-- ----------------------------------------------------------------------------
create or replace function public.mark_food_order_payment_captured(
  p_payment_id uuid,
  p_provider_payment_id text,
  p_provider_order_id text
)
returns public.food_order_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.food_order_payments;
begin
  update public.food_order_payments
  set status = 'captured', provider_payment_id = p_provider_payment_id, captured_at = now()
  where id = p_payment_id
    and status in ('created', 'pending', 'authorized')
    and provider_order_id = p_provider_order_id
  returning * into v_payment;

  if v_payment.id is null then
    select * into v_payment from public.food_order_payments where id = p_payment_id;
    return v_payment;
  end if;

  perform public._mark_trusted_write();
  update public.food_orders set payment_status = 'paid' where id = v_payment.order_id;

  perform public._create_notification(
    v_payment.passenger_id,
    'food_order',
    'Payment successful',
    format('Your payment of ₹%s was successful.', v_payment.amount),
    jsonb_build_object('order_id', v_payment.order_id, 'payment_id', v_payment.id)
  );

  return v_payment;
end;
$$;

comment on function public.mark_food_order_payment_captured(uuid, text, text) is
  'service_role only — never callable from a browser session (AUDIT-001 pattern). p_provider_order_id must match the order already attached to p_payment_id; a mismatch is a no-op (unchanged row returned, no error, no state change), the same idiom mark_ride_payment_captured uses.';

revoke execute on function public.mark_food_order_payment_captured(uuid, text, text) from public;
revoke execute on function public.mark_food_order_payment_captured(uuid, text, text) from authenticated;
grant execute on function public.mark_food_order_payment_captured(uuid, text, text) to service_role;

create or replace function public.mark_food_order_payment_failed(p_payment_id uuid, p_provider_payment_id text, p_failure_reason text)
returns public.food_order_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.food_order_payments;
begin
  update public.food_order_payments
  set status = 'failed', provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
      failure_reason = p_failure_reason, failed_at = now()
  where id = p_payment_id
    and status in ('created', 'pending', 'authorized')
  returning * into v_payment;

  if v_payment.id is null then
    select * into v_payment from public.food_order_payments where id = p_payment_id;
    return v_payment;
  end if;

  perform public._create_notification(
    v_payment.passenger_id,
    'food_order',
    'Payment failed',
    'Your payment could not be completed. You can try again or choose Cash on Delivery.',
    jsonb_build_object('order_id', v_payment.order_id, 'payment_id', v_payment.id)
  );

  return v_payment;
end;
$$;

comment on function public.mark_food_order_payment_failed(uuid, text, text) is
  'service_role only — never callable from a browser session. Marking a payment failed carries no financial-integrity risk symmetrical to captured, but is kept alongside it under the same restriction for consistency and because it is only ever invoked by the same Route Handlers/webhook.';

revoke execute on function public.mark_food_order_payment_failed(uuid, text, text) from public;
revoke execute on function public.mark_food_order_payment_failed(uuid, text, text) from authenticated;
grant execute on function public.mark_food_order_payment_failed(uuid, text, text) to service_role;

create or replace function public.get_food_order_payment(p_order_id uuid)
returns public.food_order_payments
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_payment public.food_order_payments;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select * into v_payment
  from public.food_order_payments
  where order_id = p_order_id
    and (
      passenger_id = auth.uid()
      or exists (select 1 from public.food_orders o join public.restaurants r on r.id = o.restaurant_id where o.id = p_order_id and r.owner_id = auth.uid())
      or public.is_admin()
    )
  order by created_at desc
  limit 1;

  return v_payment;
end;
$$;

revoke execute on function public.get_food_order_payment(uuid) from public;
grant execute on function public.get_food_order_payment(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- create_pending_restaurant_subscription_payment / attach — same pattern,
-- for a restaurant owner buying their own subscription (as opposed to
-- admin_grant_restaurant_subscription, the no-payment admin path).
-- ----------------------------------------------------------------------------
create or replace function public.create_pending_restaurant_subscription_payment(p_restaurant_id uuid, p_plan_id uuid)
returns public.restaurant_subscription_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(10, 2);
  v_payment public.restaurant_subscription_payments;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.restaurants where id = p_restaurant_id and owner_id = auth.uid()) then
    raise exception 'Restaurant not found or not owned by caller' using errcode = '42501';
  end if;

  select amount into v_amount from public.restaurant_subscription_plans where id = p_plan_id and is_active = true;
  if v_amount is null then
    raise exception 'Invalid or inactive plan' using errcode = '22023';
  end if;

  insert into public.restaurant_subscription_payments (restaurant_id, plan_id, amount, status)
  values (p_restaurant_id, p_plan_id, v_amount, 'created')
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke execute on function public.create_pending_restaurant_subscription_payment(uuid, uuid) from public;
grant execute on function public.create_pending_restaurant_subscription_payment(uuid, uuid) to authenticated;

create or replace function public.attach_restaurant_subscription_payment_order(p_payment_id uuid, p_provider_order_id text)
returns public.restaurant_subscription_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.restaurant_subscription_payments;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  update public.restaurant_subscription_payments
  set provider_order_id = p_provider_order_id, status = 'pending'
  where id = p_payment_id
    and status = 'created'
    and exists (select 1 from public.restaurants r where r.id = restaurant_subscription_payments.restaurant_id and r.owner_id = auth.uid())
  returning * into v_payment;

  if v_payment.id is null then
    raise exception 'Payment not found, not owned by caller, or already has an order attached' using errcode = 'P0001';
  end if;

  return v_payment;
end;
$$;

revoke execute on function public.attach_restaurant_subscription_payment_order(uuid, text) from public;
grant execute on function public.attach_restaurant_subscription_payment_order(uuid, text) to authenticated;

create unique index if not exists restaurant_subscription_payments_provider_order_unique
  on public.restaurant_subscription_payments (provider, provider_order_id)
  where provider_order_id is not null;

-- ----------------------------------------------------------------------------
-- mark_restaurant_subscription_payment_captured — service_role only, same
-- cross-order confusion fix as mark_food_order_payment_captured. On
-- success, activates (grants/extends) the actual restaurant_subscriptions
-- row directly (not via admin_grant_restaurant_subscription — that
-- function's granted_by column must stay honest: a real purchase must
-- never look like an admin grant).
-- ----------------------------------------------------------------------------
create or replace function public.mark_restaurant_subscription_payment_captured(
  p_payment_id uuid,
  p_provider_payment_id text,
  p_provider_order_id text
)
returns public.restaurant_subscription_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.restaurant_subscription_payments;
  v_duration_days integer;
  v_existing public.restaurant_subscriptions%rowtype;
  v_new_expires_at timestamptz;
  v_subscription_id uuid;
begin
  update public.restaurant_subscription_payments
  set status = 'captured', provider_payment_id = p_provider_payment_id, captured_at = now()
  where id = p_payment_id
    and status in ('created', 'pending', 'authorized')
    and provider_order_id = p_provider_order_id
  returning * into v_payment;

  if v_payment.id is null then
    select * into v_payment from public.restaurant_subscription_payments where id = p_payment_id;
    return v_payment;
  end if;

  select duration_days into v_duration_days from public.restaurant_subscription_plans where id = v_payment.plan_id;

  select * into v_existing
  from public.restaurant_subscriptions
  where restaurant_id = v_payment.restaurant_id and status = 'active'
  for update;

  if found and v_existing.expires_at > now() then
    v_new_expires_at := v_existing.expires_at + (v_duration_days || ' days')::interval;
    update public.restaurant_subscriptions
    set plan_id = v_payment.plan_id, amount = amount + v_payment.amount, expires_at = v_new_expires_at,
        payment_reference = p_payment_id::text, provider_reference = v_payment.provider_payment_id
    where id = v_existing.id
    returning id into v_subscription_id;
  else
    v_new_expires_at := now() + (v_duration_days || ' days')::interval;
    if found then
      update public.restaurant_subscriptions set status = 'expired' where id = v_existing.id;
    end if;
    insert into public.restaurant_subscriptions (restaurant_id, plan_id, amount, status, starts_at, expires_at, payment_reference, provider_reference)
    values (v_payment.restaurant_id, v_payment.plan_id, v_payment.amount, 'active', now(), v_new_expires_at, p_payment_id::text, v_payment.provider_payment_id)
    returning id into v_subscription_id;
  end if;

  update public.restaurant_subscription_payments set restaurant_subscription_id = v_subscription_id where id = p_payment_id;

  perform public._create_notification(
    (select owner_id from public.restaurants where id = v_payment.restaurant_id),
    'food_order',
    'Subscription active',
    'Your Ridora Food restaurant subscription is now active.',
    jsonb_build_object('restaurant_id', v_payment.restaurant_id)
  );

  return v_payment;
end;
$$;

comment on function public.mark_restaurant_subscription_payment_captured(uuid, text, text) is
  'service_role only. The ONLY path that activates a purchased restaurant subscription. p_provider_order_id must match the order already attached to p_payment_id.';

revoke execute on function public.mark_restaurant_subscription_payment_captured(uuid, text, text) from public;
revoke execute on function public.mark_restaurant_subscription_payment_captured(uuid, text, text) from authenticated;
grant execute on function public.mark_restaurant_subscription_payment_captured(uuid, text, text) to service_role;

create or replace function public.mark_restaurant_subscription_payment_failed(p_payment_id uuid, p_provider_payment_id text, p_failure_reason text)
returns public.restaurant_subscription_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.restaurant_subscription_payments;
begin
  update public.restaurant_subscription_payments
  set status = 'failed', provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
      failure_reason = p_failure_reason, failed_at = now()
  where id = p_payment_id
    and status in ('created', 'pending', 'authorized')
  returning * into v_payment;

  if v_payment.id is null then
    select * into v_payment from public.restaurant_subscription_payments where id = p_payment_id;
  end if;

  return v_payment;
end;
$$;

revoke execute on function public.mark_restaurant_subscription_payment_failed(uuid, text, text) from public;
revoke execute on function public.mark_restaurant_subscription_payment_failed(uuid, text, text) from authenticated;
grant execute on function public.mark_restaurant_subscription_payment_failed(uuid, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- process_payment_webhook_event — CREATE OR REPLACE, additive. The two
-- existing dispatch branches (ride payments, driver subscription payments)
-- are unchanged from 20260910140000 (still 3-arg captured calls); two new
-- branches are appended for food_order_payments and
-- restaurant_subscription_payments.
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
  v_food_payment_id uuid;
  v_restaurant_subscription_payment_id uuid;
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
    return;
  end if;

  select id into v_food_payment_id
  from public.food_order_payments
  where provider = p_provider and provider_order_id = p_provider_order_id
  limit 1;

  if v_food_payment_id is not null then
    if p_status = 'captured' then
      perform public.mark_food_order_payment_captured(v_food_payment_id, p_provider_payment_id, p_provider_order_id);
    elsif p_status in ('failed', 'cancelled') then
      perform public.mark_food_order_payment_failed(v_food_payment_id, p_provider_payment_id, p_event_type);
    end if;
    return;
  end if;

  select id into v_restaurant_subscription_payment_id
  from public.restaurant_subscription_payments
  where provider = p_provider and provider_order_id = p_provider_order_id
  limit 1;

  if v_restaurant_subscription_payment_id is not null then
    if p_status = 'captured' then
      perform public.mark_restaurant_subscription_payment_captured(v_restaurant_subscription_payment_id, p_provider_payment_id, p_provider_order_id);
    elsif p_status in ('failed', 'cancelled') then
      perform public.mark_restaurant_subscription_payment_failed(v_restaurant_subscription_payment_id, p_provider_payment_id, p_event_type);
    end if;
  end if;
end;
$$;

revoke execute on function public.process_payment_webhook_event(text, text, text, text, text, text, jsonb) from public;
revoke execute on function public.process_payment_webhook_event(text, text, text, text, text, text, jsonb) from authenticated;
grant execute on function public.process_payment_webhook_event(text, text, text, text, text, text, jsonb) to service_role;

comment on function public.process_payment_webhook_event(text, text, text, text, text, text, jsonb) is
  '20260914: extended to also dispatch to food_order_payments and restaurant_subscription_payments by provider_order_id, alongside the original ride payments/driver subscription_payments branches (unchanged, still 3-arg captured calls per 20260910140000). Still service_role only, still idempotent via the payment_webhook_events unique constraint.';
