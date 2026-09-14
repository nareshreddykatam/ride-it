-- ============================================================================
-- 20260914091000_food_delivery_assignments.sql
-- Ridora Food Phase 1. Driver-facing delivery offer/acceptance lifecycle —
-- structurally mirrors ride_offers, deliberately kept separate from
-- food_orders.status (restaurant/overall progress) exactly as ride_offers
-- is kept separate from rides.status.
--
-- driver_earning is a snapshot of food_orders.delivery_fee at offer time —
-- the simplest defensible model given the brief specifies no commission
-- structure: the full delivery_fee goes to the driver, the platform's
-- revenue for Food comes from the restaurant subscription, not a per-order
-- cut. Documented here as a deliberate Phase 1 product decision, not an
-- oversight.
-- ============================================================================

create table public.food_delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.food_orders (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete restrict,
  status public.food_delivery_assignment_status_enum not null default 'offered',
  restaurant_name_snapshot text not null,
  restaurant_address_snapshot text not null,
  pickup_location extensions.geography(Point, 4326) not null,
  delivery_address_snapshot text not null,
  delivery_location extensions.geography(Point, 4326) not null,
  distance_to_restaurant_meters double precision,
  order_amount numeric(10, 2) not null,
  driver_earning numeric(10, 2) not null default 0,
  expires_at timestamptz not null,
  offered_at timestamptz not null default now(),
  responded_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint food_delivery_assignments_unique_offer unique (order_id, driver_id)
);

create index food_delivery_assignments_driver_idx on public.food_delivery_assignments (driver_id, status);
create index food_delivery_assignments_order_idx on public.food_delivery_assignments (order_id);

comment on table public.food_delivery_assignments is 'One row per (order, driver) offer, mirroring ride_offers. Append-heavy, status-mutated only by SECURITY DEFINER matching/acceptance functions — no direct client INSERT/UPDATE policy.';

alter table public.food_delivery_assignments enable row level security;

create policy "food_delivery_assignments_select_own_driver" on public.food_delivery_assignments
  for select using (driver_id = auth.uid());

create policy "food_delivery_assignments_select_own_restaurant" on public.food_delivery_assignments
  for select using (
    exists (
      select 1 from public.food_orders o
      join public.restaurants r on r.id = o.restaurant_id
      where o.id = food_delivery_assignments.order_id and r.owner_id = auth.uid()
    )
  );

create policy "food_delivery_assignments_select_own_passenger" on public.food_delivery_assignments
  for select using (
    exists (select 1 from public.food_orders o where o.id = food_delivery_assignments.order_id and o.passenger_id = auth.uid())
  );

create policy "food_delivery_assignments_all_admin" on public.food_delivery_assignments
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- food_delivery_events — append-only granular event log per assignment
-- (e.g. driver "arrived at restaurant" / "arrived at customer" pings),
-- mirrors ride_events scoped to a delivery assignment.
-- ----------------------------------------------------------------------------
create table public.food_delivery_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.food_orders (id) on delete cascade,
  assignment_id uuid references public.food_delivery_assignments (id) on delete cascade,
  event_type text not null,
  actor_type public.actor_type_enum not null,
  actor_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index food_delivery_events_order_idx on public.food_delivery_events (order_id, created_at);

comment on table public.food_delivery_events is 'Append-only event log per food delivery assignment (arrived_restaurant, arrived_customer, ...). Never updated or deleted.';

alter table public.food_delivery_events enable row level security;

create policy "food_delivery_events_select_own_driver" on public.food_delivery_events
  for select using (
    exists (select 1 from public.food_delivery_assignments a where a.id = food_delivery_events.assignment_id and a.driver_id = auth.uid())
  );

create policy "food_delivery_events_select_own_passenger" on public.food_delivery_events
  for select using (
    exists (select 1 from public.food_orders o where o.id = food_delivery_events.order_id and o.passenger_id = auth.uid())
  );

create policy "food_delivery_events_select_own_restaurant" on public.food_delivery_events
  for select using (
    exists (
      select 1 from public.food_orders o
      join public.restaurants r on r.id = o.restaurant_id
      where o.id = food_delivery_events.order_id and r.owner_id = auth.uid()
    )
  );

create policy "food_delivery_events_select_admin" on public.food_delivery_events
  for select using (public.is_admin());
