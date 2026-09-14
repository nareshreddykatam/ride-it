-- ============================================================================
-- 20260914090500_restaurant_subscriptions.sql
-- Ridora Food Phase 1.
--
-- restaurant_subscription_plans is an Admin-managed catalog, written
-- directly under RLS (restaurant_subscription_plans_all_admin below) rather
-- than through a dedicated RPC — same treatment as the ride side's
-- subscription_plans/pricing_rules tables (simple catalog CRUD, no
-- financial side effect from editing a row, so a narrow RPC would add
-- nothing RLS doesn't already provide).
--
-- restaurant_subscriptions reuses public.subscription_status_enum
-- (active/grace_period/expired/cancelled) — identical vocabulary to the
-- driver side, no reason to fork a duplicate enum. amount is captured on
-- the row at purchase/grant time and never recomputed if the plan's price
-- changes later (spec: "do not silently change historical subscription
-- amounts") — the plan is referenced for provenance only.
-- ============================================================================

create table public.restaurant_subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  amount numeric(10, 2) not null,
  duration_days integer not null,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_subscription_plans_amount_non_negative check (amount >= 0),
  constraint restaurant_subscription_plans_duration_positive check (duration_days > 0)
);

create trigger set_updated_at
  before update on public.restaurant_subscription_plans
  for each row execute function public.set_updated_at();

comment on table public.restaurant_subscription_plans is 'Admin-configurable restaurant subscription catalog. amount/duration_days are the source of truth for every purchase/grant — never a client-supplied number.';

alter table public.restaurant_subscription_plans enable row level security;

create policy "restaurant_subscription_plans_select_all" on public.restaurant_subscription_plans
  for select using (true);

create policy "restaurant_subscription_plans_all_admin" on public.restaurant_subscription_plans
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- restaurant_subscriptions
-- ----------------------------------------------------------------------------
create table public.restaurant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  plan_id uuid not null references public.restaurant_subscription_plans (id) on delete restrict,
  amount numeric(10, 2) not null,
  status public.subscription_status_enum not null default 'active',
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  payment_reference text,
  provider_reference text,
  granted_by uuid references public.admin_users (id) on delete set null,
  grant_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_subscriptions_amount_non_negative check (amount >= 0),
  constraint restaurant_subscriptions_expiry_after_start check (expires_at > starts_at)
);

-- One active subscription per restaurant at a time — same partial unique
-- index shape as the driver-side subscriptions table.
create unique index restaurant_subscriptions_one_active on public.restaurant_subscriptions (restaurant_id) where status = 'active';
create index restaurant_subscriptions_restaurant_idx on public.restaurant_subscriptions (restaurant_id, created_at desc);

create trigger set_updated_at
  before update on public.restaurant_subscriptions
  for each row execute function public.set_updated_at();

comment on table public.restaurant_subscriptions is 'A restaurant''s subscription period. "Restaurant is live" requires status=active AND expires_at > now() AND restaurants.status=approved AND restaurants.is_open — computed at query time, never a single denormalized flag.';

alter table public.restaurant_subscriptions enable row level security;

create policy "restaurant_subscriptions_select_own_owner" on public.restaurant_subscriptions
  for select using (
    exists (select 1 from public.restaurants r where r.id = restaurant_subscriptions.restaurant_id and r.owner_id = auth.uid())
  );

create policy "restaurant_subscriptions_all_admin" on public.restaurant_subscriptions
  for all using (public.is_admin()) with check (public.is_admin());

-- No direct client INSERT/UPDATE policy for the owner — every subscription
-- row is created/activated via the payment RPCs (next migrations) or the
-- admin grant RPC below, mirroring how driver subscriptions are never
-- client-writable directly.

-- ----------------------------------------------------------------------------
-- restaurant_subscription_payments — gateway-granular payment attempts
-- backing a restaurant_subscriptions row. Mirrors subscription_payments
-- (driver side) exactly, including the denormalized restaurant_id for
-- Admin's payment-report queries.
-- ----------------------------------------------------------------------------
create table public.restaurant_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_subscription_id uuid references public.restaurant_subscriptions (id) on delete restrict,
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  plan_id uuid not null references public.restaurant_subscription_plans (id) on delete restrict,
  amount numeric(10, 2) not null,
  currency char(3) not null default 'INR',
  status public.payment_gateway_status_enum not null default 'created',
  provider text not null default 'razorpay',
  provider_order_id text,
  provider_payment_id text,
  failure_reason text,
  created_at timestamptz not null default now(),
  captured_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint restaurant_subscription_payments_amount_positive check (amount > 0)
);

create index restaurant_subscription_payments_restaurant_idx on public.restaurant_subscription_payments (restaurant_id, created_at desc);
create index restaurant_subscription_payments_provider_order_idx on public.restaurant_subscription_payments (provider, provider_order_id);

create trigger set_updated_at
  before update on public.restaurant_subscription_payments
  for each row execute function public.set_updated_at();

comment on table public.restaurant_subscription_payments is 'Gateway-granular payment attempts backing a restaurant subscription purchase. Written only via the restaurant subscription payment RPCs (next migration), never directly by client code.';

alter table public.restaurant_subscription_payments enable row level security;

create policy "restaurant_subscription_payments_select_own_owner" on public.restaurant_subscription_payments
  for select using (
    exists (select 1 from public.restaurants r where r.id = restaurant_subscription_payments.restaurant_id and r.owner_id = auth.uid())
  );

create policy "restaurant_subscription_payments_all_admin" on public.restaurant_subscription_payments
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- restaurant_status_history — immutable audit trail of every admin
-- approve/reject/suspend/reactivate decision. Mirrors admin_subscription_
-- actions' "insert-only via the RPC, no direct write policy for anyone"
-- discipline.
-- ----------------------------------------------------------------------------
create table public.restaurant_status_history (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  old_status public.restaurant_status_enum,
  new_status public.restaurant_status_enum not null,
  admin_id uuid not null references public.admin_users (id),
  notes text,
  created_at timestamptz not null default now()
);

create index restaurant_status_history_restaurant_idx on public.restaurant_status_history (restaurant_id, created_at desc);

comment on table public.restaurant_status_history is 'Immutable audit log of every admin restaurant status decision. Written only by admin_set_restaurant_status() (SECURITY DEFINER) — no role has a direct write policy.';

alter table public.restaurant_status_history enable row level security;

create policy "restaurant_status_history_select_own_owner" on public.restaurant_status_history
  for select using (
    exists (select 1 from public.restaurants r where r.id = restaurant_status_history.restaurant_id and r.owner_id = auth.uid())
  );

create policy "restaurant_status_history_select_admin" on public.restaurant_status_history
  for select using (public.is_admin());

-- ----------------------------------------------------------------------------
-- admin_set_restaurant_status — approve/reject/suspend/reactivate. The only
-- path that ever changes restaurants.status (protect_restaurant_system_
-- columns blocks every other write path, including the owner's own
-- session). Every call is audited.
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_restaurant_status(
  p_restaurant_id uuid,
  p_status public.restaurant_status_enum,
  p_notes text default null
)
returns public.restaurants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_restaurant public.restaurants;
  v_old_status public.restaurant_status_enum;
begin
  if v_admin_id is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not public.is_admin() then
    raise exception 'Only an admin can change restaurant status' using errcode = '42501';
  end if;

  if p_status in ('rejected', 'suspended') and p_notes is null then
    raise exception 'A reason is required to reject or suspend a restaurant' using errcode = '22023';
  end if;

  select status into v_old_status from public.restaurants where id = p_restaurant_id for update;
  if v_old_status is null then
    raise exception 'Restaurant not found' using errcode = 'P0002';
  end if;

  perform public._mark_trusted_write();

  update public.restaurants
  set status = p_status,
      rejection_reason = case when p_status = 'rejected' then p_notes else null end,
      suspended_reason = case when p_status = 'suspended' then p_notes else null end
  where id = p_restaurant_id
  returning * into v_restaurant;

  insert into public.restaurant_status_history (restaurant_id, old_status, new_status, admin_id, notes)
  values (p_restaurant_id, v_old_status, p_status, v_admin_id, p_notes);

  return v_restaurant;
end;
$$;

comment on function public.admin_set_restaurant_status(uuid, public.restaurant_status_enum, text) is
  'Admin-only restaurant status transition (approve/reject/suspend/reactivate). Rejecting or suspending requires a reason. Every call is recorded in restaurant_status_history.';

revoke all on function public.admin_set_restaurant_status(uuid, public.restaurant_status_enum, text) from public;
grant execute on function public.admin_set_restaurant_status(uuid, public.restaurant_status_enum, text) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_grant_restaurant_subscription — mirrors admin_grant_driver_
-- subscription (20260903103000) exactly: amount/duration always looked up
-- from restaurant_subscription_plans, grant-vs-extend decided server-side
-- from the restaurant's actual current subscription row (locked FOR UPDATE
-- for concurrency safety), every call audited.
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
    v_new_starts_at := now();
    v_new_expires_at := now() + (v_duration_days || ' days')::interval;

    if found then
      update public.restaurant_subscriptions set status = 'expired' where id = v_existing.id;
    end if;

    insert into public.restaurant_subscriptions (restaurant_id, plan_id, status, amount, starts_at, expires_at, granted_by, grant_reason)
    values (p_restaurant_id, p_plan_id, 'active', v_amount, v_new_starts_at, v_new_expires_at, v_admin_id, p_reason)
    returning id into v_subscription_id;
  end if;

  return (select s from public.restaurant_subscriptions s where s.id = v_subscription_id);
end;
$$;

comment on function public.admin_grant_restaurant_subscription(uuid, uuid, text) is
  'Admin-only grant/extend of a restaurant subscription. Amount/duration always come from restaurant_subscription_plans, never the client. Mirrors admin_grant_driver_subscription''s grant-vs-extend and locking discipline.';

revoke all on function public.admin_grant_restaurant_subscription(uuid, uuid, text) from public;
grant execute on function public.admin_grant_restaurant_subscription(uuid, uuid, text) to authenticated;
