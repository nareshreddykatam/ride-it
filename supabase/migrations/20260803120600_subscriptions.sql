-- ============================================================================
-- 0007_subscriptions.sql
-- Ride It's entire revenue model: drivers pay a flat subscription instead
-- of a per-ride commission. These two tables are the ledger for that.
-- ============================================================================

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  plan public.subscription_plan_enum not null,
  status public.subscription_status_enum not null default 'active',
  amount numeric(10, 2) not null,
  currency char(3) not null default 'INR',
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  auto_renew boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint subscriptions_amount_non_negative check (amount >= 0),
  constraint subscriptions_expires_after_starts check (expires_at > starts_at)
);

create index subscriptions_driver_idx on public.subscriptions (driver_id);
create index subscriptions_status_idx on public.subscriptions (status) where deleted_at is null;
-- Expiry sweep jobs (flip active -> expired/grace_period) scan this.
create index subscriptions_expires_at_idx on public.subscriptions (expires_at) where status = 'active';
-- A driver should have at most one active subscription at a time — this is
-- the constraint that makes "is this driver allowed online?" a cheap
-- existence check instead of a business-logic scan.
create unique index subscriptions_one_active_per_driver_idx
  on public.subscriptions (driver_id) where status = 'active' and deleted_at is null;

create trigger set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

comment on table public.subscriptions is 'Driver subscription periods. Only one status=active row per driver at a time (partial unique index) — this is what "is this driver allowed to go online" checks against.';

-- ----------------------------------------------------------------------------
-- subscription_payments — the actual payment transactions behind a
-- subscription. Split from `subscriptions` because one subscription period
-- can have multiple payment attempts (a failed charge retried), and because
-- Admin's "payment reports" screen queries this table directly without
-- needing to join through ride/driver activity.
-- ----------------------------------------------------------------------------
create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete cascade, -- denormalized for direct reporting queries
  amount numeric(10, 2) not null,
  currency char(3) not null default 'INR',
  status public.payment_status_enum not null default 'pending',
  payment_method public.payment_method_enum,
  provider text, -- e.g. 'razorpay'
  provider_reference text, -- provider's transaction/order id, for reconciliation
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_payments_amount_non_negative check (amount >= 0),
  constraint subscription_payments_paid_at_requires_paid_status
    check (status != 'paid' or paid_at is not null)
);

create index subscription_payments_driver_idx on public.subscription_payments (driver_id, created_at desc);
create index subscription_payments_subscription_idx on public.subscription_payments (subscription_id);
create index subscription_payments_status_idx on public.subscription_payments (status);
create unique index subscription_payments_provider_reference_idx
  on public.subscription_payments (provider, provider_reference) where provider_reference is not null;

create trigger set_updated_at
  before update on public.subscription_payments
  for each row execute function public.set_updated_at();

comment on table public.subscription_payments is 'Individual payment attempts backing a subscription. driver_id is intentionally denormalized from subscriptions for Admin''s payment-report queries. No deleted_at — payment records are a financial ledger and are never removed.';
