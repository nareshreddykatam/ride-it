-- ============================================================================
-- 0009_wallets.sql
-- Generic wallet — modeled against `users`, not `drivers`, even though only
-- the Driver app currently has wallet UI. Passengers could plausibly get
-- promo-credit/refund wallets later without a schema change if this stays
-- keyed to users rather than drivers.
-- ============================================================================

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  balance numeric(12, 2) not null default 0,
  currency char(3) not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallets_user_unique unique (user_id),
  constraint wallets_balance_non_negative check (balance >= 0)
);

create trigger set_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();

comment on table public.wallets is 'One wallet per user (any role). balance is denormalized for fast reads but must always equal the sum of wallet_transactions — see comment on that table.';

-- ----------------------------------------------------------------------------
-- wallet_transactions — append-only ledger. balance is never mutated
-- directly by application code in the intended design; every change goes
-- through an inserted transaction row (and, in production, a trigger or
-- RPC function that atomically updates wallets.balance alongside the
-- insert — not included in this schema-only phase, flagged as a Phase 4
-- item in the review doc).
-- ----------------------------------------------------------------------------
create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  type public.wallet_transaction_type_enum not null,
  reason public.wallet_transaction_reason_enum not null,
  amount numeric(12, 2) not null,
  balance_after numeric(12, 2) not null,
  reference_type text, -- e.g. 'ride', 'subscription_payment' — polymorphic, not an FK (see below)
  reference_id uuid,
  description text,
  created_at timestamptz not null default now(),
  constraint wallet_transactions_amount_positive check (amount > 0),
  constraint wallet_transactions_balance_after_non_negative check (balance_after >= 0)
);

create index wallet_transactions_wallet_idx on public.wallet_transactions (wallet_id, created_at desc);
create index wallet_transactions_reference_idx on public.wallet_transactions (reference_type, reference_id);

comment on table public.wallet_transactions is 'Immutable ledger — no updated_at/deleted_at, rows are never modified. reference_type/reference_id is a deliberate polymorphic pointer (a ride OR a subscription_payment OR a manual adjustment) rather than three separate nullable FK columns; integrity is enforced at the application layer, not the database, which is the one intentional normalization tradeoff in this schema — see review doc.';
