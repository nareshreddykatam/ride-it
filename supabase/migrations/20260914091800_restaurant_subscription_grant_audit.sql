-- ============================================================================
-- 20260914091800_restaurant_subscription_grant_audit.sql
-- Ridora Food Phase 1.
--
-- Gap found in self-review: admin_grant_driver_subscription's driver-side
-- equivalent (20260903103000) writes an immutable admin_subscription_
-- actions audit row on every grant/extend; admin_grant_restaurant_
-- subscription (20260914090500) did not get the same treatment — it only
-- left granted_by/grant_reason on the mutable restaurant_subscriptions row
-- itself, which a later grant overwrites. Mirrors admin_subscription_
-- actions exactly: insert-only via the RPC (SECURITY DEFINER), no role has
-- a direct write policy, so this cannot be edited after the fact.
-- ============================================================================

create table public.admin_restaurant_subscription_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users (id),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  subscription_id uuid not null references public.restaurant_subscriptions (id) on delete cascade,
  action text not null check (action in ('grant', 'extend')),
  plan_id uuid not null references public.restaurant_subscription_plans (id),
  amount numeric(10, 2) not null,
  previous_expires_at timestamptz,
  new_expires_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now()
);

create index admin_restaurant_subscription_actions_restaurant_idx on public.admin_restaurant_subscription_actions (restaurant_id, created_at desc);

comment on table public.admin_restaurant_subscription_actions is 'Immutable audit log of every admin-initiated restaurant subscription grant/extend. Written only by admin_grant_restaurant_subscription() (SECURITY DEFINER) — no role has a direct write policy, so this cannot be edited after the fact, including by admins. Mirrors admin_subscription_actions (driver side).';

alter table public.admin_restaurant_subscription_actions enable row level security;

create policy "admin_restaurant_subscription_actions_select_admin" on public.admin_restaurant_subscription_actions
  for select using (public.is_admin());

create policy "admin_restaurant_subscription_actions_select_own_owner" on public.admin_restaurant_subscription_actions
  for select using (
    exists (select 1 from public.restaurants r where r.id = admin_restaurant_subscription_actions.restaurant_id and r.owner_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- admin_grant_restaurant_subscription — CREATE OR REPLACE, additive. Every
-- existing line is unchanged; the only addition is the audit insert at the
-- end, mirroring admin_grant_driver_subscription's own structure.
-- ----------------------------------------------------------------------------
create or replace function public.admin_grant_restaurant_subscription(
  p_restaurant_id uuid,
  p_plan_id uuid,
  p_reason text default null
)
returns public.restaurant_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_amount numeric(10, 2);
  v_duration_days integer;
  v_existing public.restaurant_subscriptions%rowtype;
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
    raise exception 'Only an admin can grant restaurant subscriptions' using errcode = '42501';
  end if;

  if not exists (select 1 from public.restaurants where id = p_restaurant_id) then
    raise exception 'Restaurant not found' using errcode = 'P0002';
  end if;

  select amount, duration_days into v_amount, v_duration_days
  from public.restaurant_subscription_plans
  where id = p_plan_id and is_active = true;

  if v_amount is null then
    raise exception 'Invalid or inactive plan' using errcode = '22023';
  end if;

  select * into v_existing
  from public.restaurant_subscriptions
  where restaurant_id = p_restaurant_id and status = 'active'
  for update;

  if found and v_existing.expires_at > now() then
    v_action := 'extend';
    v_previous_expires_at := v_existing.expires_at;
    v_new_expires_at := v_existing.expires_at + (v_duration_days || ' days')::interval;

    update public.restaurant_subscriptions
    set plan_id = p_plan_id,
        amount = amount + v_amount,
        expires_at = v_new_expires_at,
        granted_by = v_admin_id,
        grant_reason = coalesce(p_reason, grant_reason)
    where id = v_existing.id
    returning id into v_subscription_id;
  else
    v_action := 'grant';
    v_previous_expires_at := case when found then v_existing.expires_at else null end;
    v_new_starts_at := now();
    v_new_expires_at := now() + (v_duration_days || ' days')::interval;

    if found then
      update public.restaurant_subscriptions set status = 'expired' where id = v_existing.id;
    end if;

    insert into public.restaurant_subscriptions (restaurant_id, plan_id, status, amount, starts_at, expires_at, granted_by, grant_reason)
    values (p_restaurant_id, p_plan_id, 'active', v_amount, v_new_starts_at, v_new_expires_at, v_admin_id, p_reason)
    returning id into v_subscription_id;
  end if;

  insert into public.admin_restaurant_subscription_actions (
    admin_id, restaurant_id, subscription_id, action, plan_id, amount, previous_expires_at, new_expires_at, reason
  ) values (
    v_admin_id, p_restaurant_id, v_subscription_id, v_action, p_plan_id, v_amount, v_previous_expires_at, v_new_expires_at, p_reason
  );

  return (select s from public.restaurant_subscriptions s where s.id = v_subscription_id);
end;
$$;

comment on function public.admin_grant_restaurant_subscription(uuid, uuid, text) is
  '20260914: added an admin_restaurant_subscription_actions audit insert — every other line unchanged from 20260914090500. Every grant/extend is now permanently recorded, matching admin_grant_driver_subscription''s audit discipline.';

revoke all on function public.admin_grant_restaurant_subscription(uuid, uuid, text) from public;
grant execute on function public.admin_grant_restaurant_subscription(uuid, uuid, text) to authenticated;
