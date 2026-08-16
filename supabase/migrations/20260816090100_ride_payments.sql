-- ============================================================================
-- 20260816090100_ride_payments.sql
-- Phase 11. The internal payment record for Ride It Online ride payments.
-- Deliberately NOT reusing rides.payment_status (too coarse — pending/
-- paid/failed/refunded) for the gateway-level lifecycle a real checkout
-- needs to track (created -> pending -> authorized -> captured, or
-- failed/cancelled, or refunded/partially_refunded afterward). This
-- table is the gateway-granular detail; rides.payment_status remains the
-- simpler business-level status derived from it (set to 'paid' only once
-- this table reaches 'captured' — see mark_ride_payment_captured in the
-- next migration).
--
-- This is a genuinely new concept (nothing like it existed before), not
-- a duplicate ledger — wallet_transactions (Phase 3) remains the
-- authoritative append-only financial ledger for wallet balance changes;
-- this table tracks gateway transaction state, a different concern.
-- ============================================================================

create type public.payment_gateway_status_enum as enum (
  'created', 'pending', 'authorized', 'captured', 'failed', 'cancelled', 'refunded', 'partially_refunded'
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete restrict,
  passenger_id uuid not null references public.passengers (id) on delete restrict,
  amount numeric(10, 2) not null,
  currency char(3) not null default 'INR',
  status public.payment_gateway_status_enum not null default 'created',
  provider text not null default 'razorpay',
  provider_order_id text,
  provider_payment_id text,
  failure_reason text,
  refund_id text,
  refunded_amount numeric(10, 2),
  created_at timestamptz not null default now(),
  authorized_at timestamptz,
  captured_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint payments_amount_positive check (amount > 0),
  constraint payments_refunded_amount_valid check (refunded_amount is null or (refunded_amount > 0 and refunded_amount <= amount)),
  constraint payments_captured_at_requires_captured check (status != 'captured' or captured_at is not null),
  constraint payments_failed_at_requires_failed check (status != 'failed' or failed_at is not null)
);

create unique index payments_one_captured_per_ride on public.payments (ride_id) where status = 'captured';

create unique index payments_one_in_flight_per_ride on public.payments (ride_id)
  where status in ('created', 'pending', 'authorized');

create index payments_passenger_idx on public.payments (passenger_id, created_at desc);
create index payments_provider_order_idx on public.payments (provider, provider_order_id);

create trigger set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

comment on table public.payments is 'Internal record for Ride It Online ride payments — the gateway-granular transaction lifecycle. Never written to directly by client code; only via create_pending_ride_payment/attach_ride_payment_order/mark_ride_payment_captured/mark_ride_payment_failed (all SECURITY DEFINER, next migration).';

alter table public.payments enable row level security;

create policy "payments_select_own_passenger" on public.payments
  for select using (passenger_id = auth.uid());

create policy "payments_select_active_ride_driver" on public.payments
  for select using (
    exists (
      select 1 from public.rides r
      where r.id = payments.ride_id and r.driver_id = auth.uid()
    )
  );

create policy "payments_all_admin" on public.payments
  for all using (public.is_admin()) with check (public.is_admin());

create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payment_webhook_events_unique_event unique (provider, provider_event_id)
);

create index payment_webhook_events_created_idx on public.payment_webhook_events (created_at desc);

comment on table public.payment_webhook_events is 'Raw webhook event audit trail + idempotency guard (unique provider+provider_event_id). Only ever written by process_payment_webhook_event (service_role only, next migration) — never by any client.';

alter table public.payment_webhook_events enable row level security;

create policy "payment_webhook_events_all_admin" on public.payment_webhook_events
  for all using (public.is_admin()) with check (public.is_admin());
