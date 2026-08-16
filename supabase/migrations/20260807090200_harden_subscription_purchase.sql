-- ============================================================================
-- 20260807090200_harden_subscription_purchase.sql
-- Phase 6.1 security hardening, item 3.
--
-- Vulnerability: purchase_subscription_simulated(p_plan, p_amount,
-- p_duration_days) took amount and duration directly from the client. A
-- modified client (or a raw RPC call) could purchase a "yearly" plan for
-- ₹1 and 3650 days, or any other arbitrary combination — the function
-- validated nothing about them.
--
-- Fix: a small reference table (subscription_plans) becomes the source of
-- truth for what each plan actually costs and lasts. The RPC now takes
-- ONLY p_plan and looks up amount/duration_days itself — there is no
-- longer any client-supplied number that ends up in a subscriptions row.
-- No Admin UI is built for this table (explicitly out of scope) — it's a
-- server-side reference table only, seeded here, same pattern as
-- pricing_rules/cities/admin_roles from Phase 3.
-- ============================================================================

create table public.subscription_plans (
  plan public.subscription_plan_enum primary key,
  amount numeric(10, 2) not null,
  duration_days integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_amount_non_negative check (amount >= 0),
  constraint subscription_plans_duration_positive check (duration_days > 0)
);

create trigger set_updated_at
  before update on public.subscription_plans
  for each row execute function public.set_updated_at();

alter table public.subscription_plans enable row level security;

create policy "subscription_plans_select_authenticated" on public.subscription_plans
  for select using (auth.role() = 'authenticated' and is_active = true);

create policy "subscription_plans_all_admin" on public.subscription_plans
  for all using (public.is_admin()) with check (public.is_admin());

comment on table public.subscription_plans is 'Source of truth for subscription plan pricing/duration. Values here mirror what the Driver app''s Subscription screen already displays (kept in sync manually until an Admin pricing UI exists) — purchase_subscription_simulated() reads from here rather than trusting client-supplied amount/duration.';

-- Seed values match the Driver app's existing PLANS constant exactly, so
-- this migration doesn't change what a purchase actually costs — only who
-- gets to decide that number.
insert into public.subscription_plans (plan, amount, duration_days) values
  ('daily', 49.00, 1),
  ('weekly', 299.00, 7),
  ('monthly', 999.00, 30),
  ('yearly', 9999.00, 365)
on conflict (plan) do nothing;

-- ----------------------------------------------------------------------------
-- Replace the function: single p_plan parameter, amount/duration derived
-- server-side. Also adds an explicit driver-role check (audit item 4).
-- ----------------------------------------------------------------------------
create or replace function public.purchase_subscription_simulated(p_plan public.subscription_plan_enum)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.subscriptions;
  v_amount numeric(10, 2);
  v_duration_days integer;
  v_starts_at timestamptz := now();
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

  update public.subscriptions
  set status = 'expired'
  where driver_id = auth.uid() and status = 'active';

  insert into public.subscriptions (driver_id, plan, status, amount, starts_at, expires_at)
  values (auth.uid(), p_plan, 'active', v_amount, v_starts_at, v_starts_at + (v_duration_days || ' days')::interval)
  returning * into v_subscription;

  insert into public.subscription_payments (subscription_id, driver_id, amount, status, payment_method, provider, paid_at)
  values (v_subscription.id, auth.uid(), v_amount, 'paid', 'upi', 'simulated', now());

  return v_subscription;
end;
$$;

comment on function public.purchase_subscription_simulated(public.subscription_plan_enum) is
  'Amount and duration are looked up from subscription_plans, never trusted from the caller. Still no real payment gateway (Phase 6 scope) — "simulated" refers to that, not to the amount validation, which is real.';

revoke execute on function public.purchase_subscription_simulated(public.subscription_plan_enum) from public;
grant execute on function public.purchase_subscription_simulated(public.subscription_plan_enum) to authenticated;

-- The old 3-argument signature is superseded — remove it so it can't be
-- called with arbitrary amount/duration anymore. Postgres allows function
-- overloading by signature, so the old one would otherwise still exist
-- alongside the new one.
drop function if exists public.purchase_subscription_simulated(public.subscription_plan_enum, numeric, integer);
