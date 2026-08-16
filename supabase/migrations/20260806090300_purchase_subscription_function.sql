-- ============================================================================
-- 20260806090300_purchase_subscription_function.sql
-- Phase 3 deliberately gave `subscriptions`/`subscription_payments` no
-- client-writable INSERT policy — "payment-provider webhooks and
-- subscription issuance should never be client-writable directly" (Phase 3
-- review doc, approved). Phase 6 needs drivers to be able to purchase a
-- (simulated — no real payment gateway yet) subscription. Rather than
-- adding a broad INSERT policy that would let any driver insert arbitrary
-- subscription rows for anyone, this is a narrow SECURITY DEFINER function:
-- it can only create a subscription for the calling driver, with
-- status='active' and a matching 'paid' payment row, atomically. This is
-- the same pattern as increment_driver_strike — a tightly-scoped RPC
-- instead of a general write policy.
-- ============================================================================

create or replace function public.purchase_subscription_simulated(
  p_plan public.subscription_plan_enum,
  p_amount numeric,
  p_duration_days integer
)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.subscriptions;
  v_starts_at timestamptz := now();
  v_expires_at timestamptz := now() + (p_duration_days || ' days')::interval;
begin
  -- Superseding an existing active subscription (e.g. renewing early) is
  -- expressed as expiring the old one, not deleting it — history stays intact.
  update public.subscriptions
  set status = 'expired'
  where driver_id = auth.uid() and status = 'active';

  insert into public.subscriptions (driver_id, plan, status, amount, starts_at, expires_at)
  values (auth.uid(), p_plan, 'active', p_amount, v_starts_at, v_expires_at)
  returning * into v_subscription;

  insert into public.subscription_payments (subscription_id, driver_id, amount, status, payment_method, provider, paid_at)
  values (v_subscription.id, auth.uid(), p_amount, 'paid', 'upi', 'simulated', now());

  return v_subscription;
end;
$$;

comment on function public.purchase_subscription_simulated(public.subscription_plan_enum, numeric, integer) is
  'Narrow, driver-scoped subscription purchase — no real payment gateway (Phase 6 scope). Preserves the Phase 3 decision that subscriptions/subscription_payments have no general client INSERT policy by only ever writing rows for auth.uid().';

grant execute on function public.purchase_subscription_simulated(public.subscription_plan_enum, numeric, integer) to authenticated;
