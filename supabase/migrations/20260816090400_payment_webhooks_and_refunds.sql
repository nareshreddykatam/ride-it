-- ============================================================================
-- 20260816090400_payment_webhooks_and_refunds.sql
-- Phase 11.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- process_payment_webhook_event — service_role only (no authenticated
-- grant at all; a webhook has no user session, and nothing about this
-- function should ever be callable by a browser). Idempotency is a real
-- database constraint, not just application logic: the INSERT into
-- payment_webhook_events uses ON CONFLICT DO NOTHING against the unique
-- (provider, provider_event_id) index — if the row already existed
-- (duplicate/redelivered webhook), this function returns immediately
-- without touching payments/subscription_payments a second time.
--
-- Dispatches to whichever of `payments` (ride) or `subscription_payments`
-- has a matching provider_order_id — a single webhook endpoint serves
-- both payment domains (see the Phase 11 review doc's webhook
-- architecture section for why one endpoint, not two, is the correct
-- design given Razorpay configures one webhook URL per merchant account).
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
      perform public.mark_ride_payment_captured(v_ride_payment_id, p_provider_payment_id);
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
      perform public.mark_subscription_payment_captured(v_subscription_payment_id, p_provider_payment_id);
    elsif p_status in ('failed', 'cancelled') then
      perform public.mark_subscription_payment_failed(v_subscription_payment_id, p_provider_payment_id, p_event_type);
    end if;
  end if;
end;
$$;

revoke execute on function public.process_payment_webhook_event(text, text, text, text, text, text, jsonb) from public;
revoke execute on function public.process_payment_webhook_event(text, text, text, text, text, text, jsonb) from authenticated;
grant execute on function public.process_payment_webhook_event(text, text, text, text, text, text, jsonb) to service_role;

comment on function public.process_payment_webhook_event(text, text, text, text, text, text, jsonb) is 'The durable, authoritative webhook reconciliation path. service_role only — never callable from a browser. Idempotent via the payment_webhook_events unique constraint, not application-level deduplication alone.';

create or replace function public.record_ride_payment_refund(p_payment_id uuid, p_refund_id text, p_refunded_amount numeric)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_new_status public.payment_gateway_status_enum;
begin
  if not public.is_admin() then
    raise exception 'Only admins may record a refund' using errcode = '42501';
  end if;

  select * into v_payment from public.payments where id = p_payment_id;
  if v_payment.id is null then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;

  if v_payment.status != 'captured' then
    raise exception 'Only a captured payment can be refunded' using errcode = 'P0001';
  end if;

  v_new_status := case when p_refunded_amount >= v_payment.amount then 'refunded' else 'partially_refunded' end;

  update public.payments
  set status = v_new_status, refund_id = p_refund_id, refunded_amount = p_refunded_amount, refunded_at = now()
  where id = p_payment_id
  returning * into v_payment;

  perform public._mark_trusted_write();
  update public.rides set payment_status = 'refunded' where id = v_payment.ride_id;

  perform public._create_notification(
    v_payment.passenger_id,
    'payment_confirmation',
    'Refund processed',
    format('₹%s has been refunded to your original payment method.', p_refunded_amount),
    jsonb_build_object('ride_id', v_payment.ride_id, 'payment_id', v_payment.id)
  );

  return v_payment;
end;
$$;

revoke execute on function public.record_ride_payment_refund(uuid, text, numeric) from public;
grant execute on function public.record_ride_payment_refund(uuid, text, numeric) to authenticated;

comment on function public.record_ride_payment_refund(uuid, text, numeric) is 'Records a refund AFTER the Route Handler''s real gateway refund API call succeeds — never marks a refund complete on its own. admin-only (is_admin() check). See the Phase 11 review doc: this phase has no real gateway credentials, so this function is architecturally complete but has never been exercised against a real refund.';

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
  end if;

  return v_ride;
end;
$$;
