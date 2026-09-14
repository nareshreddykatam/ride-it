-- ============================================================================
-- 20260914090700_food_orders.sql
-- Ridora Food Phase 1.
--
-- food_orders carries a full delivery-address and recipient SNAPSHOT at
-- checkout time (spec sections 6/7/27) — it never joins back to
-- saved_places/passengers for "where does this go" or "who does this go
-- to", so a passenger editing their profile/saved address afterward can
-- never alter a placed order's delivery details, and "order for someone
-- else" recipient data belongs to the order alone. recipient_phone is
-- NOT NULL unconditionally — required for both self and third-party
-- orders (self-orders snapshot the passenger's own phone), matching the
-- spec's "recipient phone number MUST be mandatory" instruction literally.
--
-- No direct client INSERT/UPDATE policy on any table here — order
-- creation and every status transition go through the RPCs in
-- 20260914091200_food_order_rpcs.sql, the same discipline as payments/
-- ride_offers/passenger_ride_pins.
-- ============================================================================

create table public.food_orders (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.passengers (id) on delete restrict,
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  driver_id uuid references public.drivers (id) on delete restrict,
  status public.food_order_status_enum not null default 'placed',
  is_for_self boolean not null default true,
  recipient_name text not null,
  recipient_phone text not null,
  delivery_address text not null,
  delivery_landmark text,
  delivery_location extensions.geography(Point, 4326) not null,
  restaurant_name_snapshot text not null,
  restaurant_address_snapshot text not null,
  restaurant_location extensions.geography(Point, 4326) not null,
  distance_km numeric(6, 2),
  subtotal_amount numeric(10, 2) not null,
  delivery_fee numeric(10, 2) not null default 0,
  platform_fee numeric(10, 2) not null default 0,
  discount_amount numeric(10, 2) not null default 0,
  total_amount numeric(10, 2) not null,
  currency char(3) not null default 'INR',
  payment_method public.food_payment_method_enum not null,
  payment_status public.payment_status_enum not null default 'pending',
  special_instructions text,
  cancelled_by public.actor_type_enum,
  cancellation_reason text,
  placed_at timestamptz not null default now(),
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  driver_assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_orders_recipient_phone_format check (recipient_phone ~ '^[6-9][0-9]{9}$'),
  constraint food_orders_subtotal_non_negative check (subtotal_amount >= 0),
  constraint food_orders_delivery_fee_non_negative check (delivery_fee >= 0),
  constraint food_orders_platform_fee_non_negative check (platform_fee >= 0),
  constraint food_orders_discount_non_negative check (discount_amount >= 0),
  constraint food_orders_total_amount_valid check (total_amount = subtotal_amount + delivery_fee + platform_fee - discount_amount),
  constraint food_orders_cancellation_requires_reason check (status not in ('cancelled', 'rejected') or cancellation_reason is not null)
);

create index food_orders_passenger_idx on public.food_orders (passenger_id, created_at desc);
create index food_orders_restaurant_idx on public.food_orders (restaurant_id, created_at desc);
create index food_orders_driver_idx on public.food_orders (driver_id) where driver_id is not null;
create index food_orders_status_idx on public.food_orders (status);

create trigger set_updated_at
  before update on public.food_orders
  for each row execute function public.set_updated_at();

comment on table public.food_orders is 'A placed food order. recipient_name/recipient_phone/delivery_address/delivery_location and restaurant_name_snapshot/restaurant_address_snapshot/restaurant_location are all frozen at checkout — never re-derived from passengers/restaurants later, so historical orders are unaffected by profile/menu/restaurant edits (spec: retain historical delivery information).';

alter table public.food_orders enable row level security;

create policy "food_orders_select_own_passenger" on public.food_orders
  for select using (passenger_id = auth.uid());

create policy "food_orders_select_own_restaurant" on public.food_orders
  for select using (
    exists (select 1 from public.restaurants r where r.id = food_orders.restaurant_id and r.owner_id = auth.uid())
  );

create policy "food_orders_select_own_driver" on public.food_orders
  for select using (driver_id = auth.uid());

create policy "food_orders_all_admin" on public.food_orders
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- protect_food_order_system_columns — RLS above grants SELECT only (no
-- client role has an UPDATE policy at all), so this is defense in depth
-- for the SECURITY DEFINER RPCs themselves: it stops one RPC's bug from
-- accidentally touching a column outside its stated concern, the same
-- discipline protect_ride_pickup_columns (20260911150000) applies to rides.
-- ----------------------------------------------------------------------------
create or replace function public.protect_food_order_financial_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('ride_it.trusted_write', true), 'false') = 'true'
     or public.is_admin() then
    return new;
  end if;

  if new.subtotal_amount is distinct from old.subtotal_amount
     or new.total_amount is distinct from old.total_amount
     or new.payment_status is distinct from old.payment_status
     or new.passenger_id is distinct from old.passenger_id
     or new.restaurant_id is distinct from old.restaurant_id
  then
    raise exception 'Cannot modify protected food order fields directly' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_food_order_financial_columns on public.food_orders;
create trigger protect_food_order_financial_columns
  before update on public.food_orders
  for each row execute function public.protect_food_order_financial_columns();

-- ----------------------------------------------------------------------------
-- food_order_items — line-item SNAPSHOT. name/description/price/veg_type
-- are copied from restaurant_menu_items at order time and never re-read
-- from it afterward — deleting or repricing the source menu item never
-- changes a historical order (spec section 27).
-- ----------------------------------------------------------------------------
create table public.food_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.food_orders (id) on delete cascade,
  menu_item_id uuid references public.restaurant_menu_items (id) on delete set null,
  item_name text not null,
  item_description text,
  unit_price numeric(10, 2) not null,
  quantity integer not null,
  line_total numeric(10, 2) not null,
  veg_type public.food_veg_type_enum not null,
  special_instructions text,
  created_at timestamptz not null default now(),
  constraint food_order_items_unit_price_positive check (unit_price > 0),
  constraint food_order_items_quantity_positive check (quantity > 0),
  constraint food_order_items_line_total_valid check (line_total = unit_price * quantity)
);

create index food_order_items_order_idx on public.food_order_items (order_id);

comment on table public.food_order_items is 'Immutable snapshot of one ordered item. Written only by create_food_order() — never updated afterward.';

alter table public.food_order_items enable row level security;

create policy "food_order_items_select_own_passenger" on public.food_order_items
  for select using (
    exists (select 1 from public.food_orders o where o.id = food_order_items.order_id and o.passenger_id = auth.uid())
  );

create policy "food_order_items_select_own_restaurant" on public.food_order_items
  for select using (
    exists (
      select 1 from public.food_orders o
      join public.restaurants r on r.id = o.restaurant_id
      where o.id = food_order_items.order_id and r.owner_id = auth.uid()
    )
  );

create policy "food_order_items_select_own_driver" on public.food_order_items
  for select using (
    exists (select 1 from public.food_orders o where o.id = food_order_items.order_id and o.driver_id = auth.uid())
  );

create policy "food_order_items_all_admin" on public.food_order_items
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- food_order_status_history — append-only audit trail, mirrors ride_events
-- scoped to one order.
-- ----------------------------------------------------------------------------
create table public.food_order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.food_orders (id) on delete cascade,
  status public.food_order_status_enum not null,
  actor_type public.actor_type_enum not null,
  actor_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

create index food_order_status_history_order_idx on public.food_order_status_history (order_id, created_at);

comment on table public.food_order_status_history is 'Append-only per-order status audit trail — never updated or deleted. Written only by the order-lifecycle RPCs.';

alter table public.food_order_status_history enable row level security;

create policy "food_order_status_history_select_own_passenger" on public.food_order_status_history
  for select using (
    exists (select 1 from public.food_orders o where o.id = food_order_status_history.order_id and o.passenger_id = auth.uid())
  );

create policy "food_order_status_history_select_own_restaurant" on public.food_order_status_history
  for select using (
    exists (
      select 1 from public.food_orders o
      join public.restaurants r on r.id = o.restaurant_id
      where o.id = food_order_status_history.order_id and r.owner_id = auth.uid()
    )
  );

create policy "food_order_status_history_select_own_driver" on public.food_order_status_history
  for select using (
    exists (select 1 from public.food_orders o where o.id = food_order_status_history.order_id and o.driver_id = auth.uid())
  );

create policy "food_order_status_history_select_admin" on public.food_order_status_history
  for select using (public.is_admin());
