-- ============================================================================
-- 20260914090800_food_order_payments.sql
-- Ridora Food Phase 1. Gateway-granular payment record for online food
-- orders — structurally identical to public.payments (ride side), kept as
-- its own table (not a shared polymorphic table) for the same reason
-- ride_payments.sql gives: order_id/passenger_id are real foreign keys with
-- real referential integrity, not a polymorphic reference_type/reference_id
-- pair. payment_webhook_events (existing table, provider+provider_event_id
-- generic) is REUSED as the idempotency/audit ledger for food payment
-- webhooks too — see 20260914091300_food_payment_rpcs.sql — rather than
-- creating a duplicate webhook-events table.
--
-- COD orders never get a row here — food_orders.payment_method='cod' with
-- payment_status flipped to 'paid' by complete_food_delivery() at
-- successful delivery (mirrors how rides.complete_ride() marks cash/UPI-
-- direct rides paid).
-- ============================================================================

create table public.food_order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.food_orders (id) on delete restrict,
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
  constraint food_order_payments_amount_positive check (amount > 0),
  constraint food_order_payments_refunded_amount_valid check (refunded_amount is null or (refunded_amount > 0 and refunded_amount <= amount)),
  constraint food_order_payments_captured_at_requires_captured check (status != 'captured' or captured_at is not null),
  constraint food_order_payments_failed_at_requires_failed check (status != 'failed' or failed_at is not null)
);

create unique index food_order_payments_one_captured_per_order on public.food_order_payments (order_id) where status = 'captured';
create unique index food_order_payments_one_in_flight_per_order on public.food_order_payments (order_id) where status in ('created', 'pending', 'authorized');
create index food_order_payments_passenger_idx on public.food_order_payments (passenger_id, created_at desc);
create index food_order_payments_provider_order_idx on public.food_order_payments (provider, provider_order_id);

create trigger set_updated_at
  before update on public.food_order_payments
  for each row execute function public.set_updated_at();

comment on table public.food_order_payments is 'Internal record for online food order payments — gateway-granular lifecycle, structurally identical to public.payments (ride side). Never written to directly by client code; only via the food payment RPCs (next migration).';

alter table public.food_order_payments enable row level security;

create policy "food_order_payments_select_own_passenger" on public.food_order_payments
  for select using (passenger_id = auth.uid());

create policy "food_order_payments_select_own_restaurant" on public.food_order_payments
  for select using (
    exists (
      select 1 from public.food_orders o
      join public.restaurants r on r.id = o.restaurant_id
      where o.id = food_order_payments.order_id and r.owner_id = auth.uid()
    )
  );

create policy "food_order_payments_all_admin" on public.food_order_payments
  for all using (public.is_admin()) with check (public.is_admin());
