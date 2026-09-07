-- ============================================================================
-- 20260907091000_vehicle_specific_subscription_plans.sql
--
-- Found during the production driver-lifecycle/fare audit: subscription_plans
-- has no vehicle_type column at all (PK is `plan` alone) — every vehicle type
-- (bike/auto/scooty/car) is charged the exact same daily/weekly/monthly/
-- yearly amount today, and apps/driver/app/subscription/page.tsx additionally
-- hardcodes those four amounts as frontend constants (a second, independent
-- copy of the same non-vehicle-specific pricing). Business requirement:
-- subscription price must vary by vehicle type.
--
-- This migration makes the plan catalog vehicle-specific:
--   subscription_plans: PK becomes (vehicle_type, plan) instead of (plan).
--   subscriptions: gains a vehicle_type column recording which vehicle type
--     the subscription was purchased/granted for, FK'd to the matching
--     subscription_plans row.
--
-- No vehicle-specific PRICES are invented here. The 4 pre-existing plan rows
-- are expanded into one row per vehicle type, each carrying forward the
-- EXACT SAME amount/duration_days the (single, vehicle-agnostic) row already
-- had — the only real, currently-defined values in the system. This is
-- schema/config plumbing, not a pricing decision: Admin must now go into
-- Admin > Subscriptions and set genuinely different per-vehicle-type prices;
-- until then, every vehicle type's price is identical (unchanged from
-- today), which is honestly what "no vehicle-specific pricing has been
-- configured yet" looks like.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- subscription_plans: (plan) -> (vehicle_type, plan)
-- ----------------------------------------------------------------------------
alter table public.subscription_plans add column vehicle_type public.vehicle_type_enum;

-- Drop the old single-column PK BEFORE inserting the expanded rows below —
-- otherwise inserting 4 rows that all share the same `plan` value (one per
-- vehicle_type) collides with the still-active (plan) uniqueness.
alter table public.subscription_plans drop constraint subscription_plans_pkey;

insert into public.subscription_plans (vehicle_type, plan, amount, duration_days, is_active, created_at, updated_at)
select vt.vehicle_type, sp.plan, sp.amount, sp.duration_days, sp.is_active, sp.created_at, sp.updated_at
from public.subscription_plans sp
cross join (select unnest(enum_range(null::public.vehicle_type_enum)) as vehicle_type) vt
where sp.vehicle_type is null;

delete from public.subscription_plans where vehicle_type is null;

alter table public.subscription_plans alter column vehicle_type set not null;
alter table public.subscription_plans add constraint subscription_plans_pkey primary key (vehicle_type, plan);

comment on table public.subscription_plans is 'Vehicle-specific subscription price catalog. Natural key is (vehicle_type, plan) -- the same plan tier (daily/weekly/monthly/yearly) can and should have a different amount per vehicle_type. Source of truth for every subscription purchase/grant; the client never supplies amount/duration.';
comment on column public.subscription_plans.vehicle_type is 'Which vehicle type this price/duration applies to. Added 20260907 -- previously one row per plan served all vehicle types identically.';

-- ----------------------------------------------------------------------------
-- subscriptions: record which vehicle type each subscription was for.
-- Backfilled from the driver's CURRENT drivers.vehicle_type -- the historical
-- vehicle type at original purchase time isn't recorded anywhere else, so
-- this is the best available signal for existing rows (a driver changing
-- their registered vehicle type between purchases is an edge case the
-- backfill can't reconstruct perfectly, but matches every currently-active
-- subscription to a real, existing subscription_plans row 1:1 since every
-- plan tier was just expanded to every vehicle type above).
-- ----------------------------------------------------------------------------
alter table public.subscriptions add column vehicle_type public.vehicle_type_enum;

update public.subscriptions s
set vehicle_type = d.vehicle_type
from public.drivers d
where d.id = s.driver_id and s.vehicle_type is null;

alter table public.subscriptions alter column vehicle_type set not null;

alter table public.subscriptions
  add constraint subscriptions_plan_fk foreign key (vehicle_type, plan)
  references public.subscription_plans (vehicle_type, plan);

comment on column public.subscriptions.vehicle_type is 'Vehicle type this subscription was purchased/granted for -- snapshotted at purchase/grant time, not re-derived from the driver''s current vehicle type later, so it stays historically accurate even if the driver''s registered vehicle type later changes.';

-- ----------------------------------------------------------------------------
-- admin_subscription_actions: audit trail also records vehicle_type, for
-- complete grant/extend history fidelity.
-- ----------------------------------------------------------------------------
alter table public.admin_subscription_actions add column vehicle_type public.vehicle_type_enum;

update public.admin_subscription_actions a
set vehicle_type = s.vehicle_type
from public.subscriptions s
where s.id = a.subscription_id and a.vehicle_type is null;

alter table public.admin_subscription_actions alter column vehicle_type set not null;

-- ----------------------------------------------------------------------------
-- create_pending_subscription_payment: plan lookup is now scoped to the
-- calling driver's own vehicle_type (drivers.vehicle_type -- never a client
-- parameter). A driver can only ever buy a subscription for their own
-- registered vehicle type.
-- ----------------------------------------------------------------------------
create or replace function public.create_pending_subscription_payment(p_plan public.subscription_plan_enum)
returns public.subscription_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle_type public.vehicle_type_enum;
  v_amount numeric(10, 2);
  v_duration_days integer;
  v_existing public.subscription_payments;
  v_subscription_id uuid;
  v_payment public.subscription_payments;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select d.vehicle_type into v_vehicle_type from public.drivers d where d.id = auth.uid();
  if v_vehicle_type is null then
    raise exception 'Caller is not a registered driver' using errcode = '42501';
  end if;

  select sp.amount, sp.duration_days into v_amount, v_duration_days
  from public.subscription_plans sp
  where sp.vehicle_type = v_vehicle_type and sp.plan = p_plan and sp.is_active = true;

  if v_amount is null then
    raise exception 'Invalid or inactive plan: %', p_plan using errcode = '22023';
  end if;

  select sp2.* into v_existing
  from public.subscription_payments sp2
  where sp2.driver_id = auth.uid() and sp2.status = 'pending' and sp2.provider != 'simulated'
  order by sp2.created_at desc
  limit 1;

  if v_existing.id is not null then
    return v_existing;
  end if;

  insert into public.subscriptions (driver_id, vehicle_type, plan, status, amount, starts_at, expires_at)
  values (auth.uid(), v_vehicle_type, p_plan, 'expired', v_amount, now(), now() + interval '1 second')
  returning id into v_subscription_id;

  insert into public.subscription_payments (subscription_id, driver_id, amount, currency, status, payment_method, provider)
  values (v_subscription_id, auth.uid(), v_amount, 'INR', 'pending', 'online', 'razorpay')
  returning * into v_payment;

  return v_payment;
end;
$$;

comment on function public.create_pending_subscription_payment(public.subscription_plan_enum) is 'Step 1 of a real subscription purchase. vehicle_type is the calling driver''s own drivers.vehicle_type (never a parameter); amount/duration are read from subscription_plans for that (vehicle_type, plan) pair, never a parameter. 20260907: made vehicle-type-aware.';

-- ----------------------------------------------------------------------------
-- mark_subscription_payment_captured: the subscription_plans join now
-- matches on (vehicle_type, plan), not plan alone.
-- ----------------------------------------------------------------------------
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
  join public.subscription_plans sp on sp.vehicle_type = s.vehicle_type and sp.plan = s.plan
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

comment on function public.mark_subscription_payment_captured(uuid, text) is 'The ONLY path that activates a driver subscription. 20260907: subscription_plans join now matches (vehicle_type, plan), not plan alone.';

-- ----------------------------------------------------------------------------
-- admin_grant_driver_subscription: vehicle_type comes from the driver's own
-- drivers.vehicle_type row (server-derived, never a client parameter) --
-- Part 5's "system knows driver's vehicle type -> available plans are
-- filtered to that vehicle type" applies at the RPC layer too, not just the
-- UI: an admin cannot grant a car plan to a bike driver even by tampering
-- with the request, because the vehicle_type used for the subscription_plans
-- lookup is read from the driver's own row, not supplied by the caller.
-- ----------------------------------------------------------------------------
create or replace function public.admin_grant_driver_subscription(
  p_driver_id uuid,
  p_plan public.subscription_plan_enum,
  p_reason text default null
)
returns table (
  subscription_id uuid,
  plan public.subscription_plan_enum,
  status public.subscription_status_enum,
  starts_at timestamptz,
  expires_at timestamptz,
  amount numeric,
  action text,
  previous_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_vehicle_type public.vehicle_type_enum;
  v_amount numeric(10, 2);
  v_duration_days integer;
  v_existing public.subscriptions%rowtype;
  v_action text;
  v_previous_expires_at timestamptz;
  v_new_starts_at timestamptz;
  v_new_expires_at timestamptz;
  v_subscription_id uuid;
begin
  if v_admin_id is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not public.is_admin() then
    raise exception 'Only an admin can grant subscriptions' using errcode = '42501';
  end if;

  if p_driver_id is null then
    raise exception 'driver_id is required' using errcode = '22023';
  end if;

  select d.vehicle_type into v_vehicle_type from public.drivers d where d.id = p_driver_id;
  if v_vehicle_type is null then
    raise exception 'Driver not found' using errcode = 'P0002';
  end if;

  select sp.amount, sp.duration_days into v_amount, v_duration_days
  from public.subscription_plans sp
  where sp.vehicle_type = v_vehicle_type and sp.plan = p_plan and sp.is_active = true;

  if v_amount is null then
    raise exception 'Invalid or inactive plan for this driver''s vehicle type: %', p_plan using errcode = '22023';
  end if;

  -- Lock this driver's active row (if any) for the duration of this
  -- transaction — see 20260903103000's concurrency note.
  select * into v_existing
  from public.subscriptions s
  where s.driver_id = p_driver_id and s.status = 'active' and s.deleted_at is null
  for update;

  if found and v_existing.expires_at > now() then
    v_action := 'extend';
    v_previous_expires_at := v_existing.expires_at;
    v_new_starts_at := v_existing.starts_at;
    v_new_expires_at := v_existing.expires_at + (v_duration_days || ' days')::interval;

    update public.subscriptions s
    set plan = p_plan,
        vehicle_type = v_vehicle_type,
        amount = s.amount + v_amount,
        expires_at = v_new_expires_at,
        granted_by = v_admin_id,
        grant_reason = coalesce(p_reason, s.grant_reason)
    where s.id = v_existing.id
    returning s.id into v_subscription_id;
  else
    v_action := 'grant';
    v_previous_expires_at := case when found then v_existing.expires_at else null end;
    v_new_starts_at := now();
    v_new_expires_at := now() + (v_duration_days || ' days')::interval;

    if found then
      update public.subscriptions s set status = 'expired' where s.id = v_existing.id;
    end if;

    insert into public.subscriptions (driver_id, vehicle_type, plan, status, amount, starts_at, expires_at, granted_by, grant_reason)
    values (p_driver_id, v_vehicle_type, p_plan, 'active', v_amount, v_new_starts_at, v_new_expires_at, v_admin_id, p_reason)
    returning id into v_subscription_id;
  end if;

  insert into public.admin_subscription_actions (
    admin_id, driver_id, subscription_id, action, plan, vehicle_type, duration_days, amount,
    previous_expires_at, new_expires_at, reason
  ) values (
    v_admin_id, p_driver_id, v_subscription_id, v_action, p_plan, v_vehicle_type, v_duration_days, v_amount,
    v_previous_expires_at, v_new_expires_at, p_reason
  );

  return query
    select s.id, s.plan, s.status, s.starts_at, s.expires_at, s.amount, v_action, v_previous_expires_at
    from public.subscriptions s
    where s.id = v_subscription_id;
end;
$$;

comment on function public.admin_grant_driver_subscription(uuid, public.subscription_plan_enum, text) is
  'Admin-only (is_admin() enforced inside the function) grant/extend of a driver subscription. vehicle_type is read from the driver''s own drivers.vehicle_type row (never a client parameter); amount/duration always come from subscription_plans for that (vehicle_type, plan) pair. Grant vs. extend, start date, and expiry are all decided server-side, locked FOR UPDATE for concurrency safety. Every call is recorded in admin_subscription_actions. 20260907: made vehicle-type-aware.';

revoke all on function public.admin_grant_driver_subscription(uuid, public.subscription_plan_enum, text) from public;
grant execute on function public.admin_grant_driver_subscription(uuid, public.subscription_plan_enum, text) to authenticated;
