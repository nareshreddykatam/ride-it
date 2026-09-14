-- ============================================================================
-- 20260914090600_food_cart.sql
-- Ridora Food Phase 1.
--
-- One food_carts row per passenger (unique on passenger_id) tied to exactly
-- one restaurant_id — this is what makes "a cart holds items from one
-- restaurant only" a structural guarantee rather than an application-layer
-- promise. Switching restaurants means the client detects the mismatch and
-- calls clear_cart() first (spec: show a confirmation, never silently
-- drop items) then add_to_cart() against the new restaurant, which creates
-- a fresh cart row.
--
-- No direct client INSERT/UPDATE/DELETE policy on either table — every
-- mutation goes through the RPCs below, which re-validate the item belongs
-- to an orderable restaurant and re-read its current price, matching the
-- "narrow RPC over a broad write policy" discipline used throughout this
-- schema (ride_offers, passenger_ride_pins, recent_locations, ...).
-- ============================================================================

create table public.food_carts (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.passengers (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_carts_one_per_passenger unique (passenger_id)
);

create trigger set_updated_at
  before update on public.food_carts
  for each row execute function public.set_updated_at();

comment on table public.food_carts is 'A passenger''s single in-progress cart, always scoped to exactly one restaurant_id. Ephemeral working state (unlike food_orders), so cascades on passenger/restaurant deletion are acceptable here.';

alter table public.food_carts enable row level security;

create policy "food_carts_select_own" on public.food_carts
  for select using (passenger_id = auth.uid());

create policy "food_carts_all_admin" on public.food_carts
  for all using (public.is_admin()) with check (public.is_admin());

create table public.food_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.food_carts (id) on delete cascade,
  menu_item_id uuid not null references public.restaurant_menu_items (id) on delete cascade,
  quantity integer not null,
  unit_price_snapshot numeric(10, 2) not null,
  special_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_cart_items_quantity_positive check (quantity > 0),
  constraint food_cart_items_unique_item unique (cart_id, menu_item_id)
);

create index food_cart_items_cart_idx on public.food_cart_items (cart_id);

create trigger set_updated_at
  before update on public.food_cart_items
  for each row execute function public.set_updated_at();

comment on table public.food_cart_items is 'unit_price_snapshot is a display cache only — checkout (create_food_order) always re-reads the live restaurant_menu_items.price at order time, never trusting this snapshot, so a menu price change between add-to-cart and checkout is priced correctly.';

alter table public.food_cart_items enable row level security;

create policy "food_cart_items_select_own" on public.food_cart_items
  for select using (
    exists (select 1 from public.food_carts c where c.id = food_cart_items.cart_id and c.passenger_id = auth.uid())
  );

create policy "food_cart_items_all_admin" on public.food_cart_items
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- add_to_cart(p_menu_item_id, p_quantity, p_special_instructions)
--
-- Returns the cart_id. Raises a distinct, client-detectable error
-- (errcode 'RIDF1') when the item belongs to a DIFFERENT restaurant than
-- the passenger's existing cart, rather than silently clearing it — the
-- Passenger app catches this specific error to show the "clear cart and
-- start a new order?" confirmation (spec section 25), then calls
-- clear_cart() + add_to_cart() again once the user confirms.
-- ----------------------------------------------------------------------------
create or replace function public.add_to_cart(
  p_menu_item_id uuid,
  p_quantity integer,
  p_special_instructions text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passenger_id uuid := auth.uid();
  v_item public.restaurant_menu_items%rowtype;
  v_restaurant_status public.restaurant_status_enum;
  v_cart public.food_carts%rowtype;
begin
  if v_passenger_id is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be positive' using errcode = '22023';
  end if;

  select * into v_item from public.restaurant_menu_items where id = p_menu_item_id;
  if v_item.id is null or v_item.is_active = false or v_item.is_available = false then
    raise exception 'Item not found or unavailable' using errcode = 'P0002';
  end if;

  select status into v_restaurant_status from public.restaurants where id = v_item.restaurant_id;
  if v_restaurant_status is distinct from 'approved' then
    raise exception 'Restaurant is not currently accepting orders' using errcode = 'P0001';
  end if;

  select * into v_cart from public.food_carts where passenger_id = v_passenger_id for update;

  if v_cart.id is not null and v_cart.restaurant_id != v_item.restaurant_id then
    raise exception 'Cart contains items from a different restaurant' using errcode = 'RIDF1';
  end if;

  if v_cart.id is null then
    insert into public.food_carts (passenger_id, restaurant_id)
    values (v_passenger_id, v_item.restaurant_id)
    returning * into v_cart;
  end if;

  insert into public.food_cart_items (cart_id, menu_item_id, quantity, unit_price_snapshot, special_instructions)
  values (v_cart.id, p_menu_item_id, p_quantity, v_item.price, p_special_instructions)
  on conflict (cart_id, menu_item_id) do update
    set quantity = food_cart_items.quantity + excluded.quantity,
        unit_price_snapshot = excluded.unit_price_snapshot,
        special_instructions = coalesce(excluded.special_instructions, food_cart_items.special_instructions);

  return v_cart.id;
end;
$$;

comment on function public.add_to_cart(uuid, integer, text) is
  'Adds an item to the caller''s cart, creating the cart if needed. Raises errcode RIDF1 (caught explicitly by the client) if the item belongs to a different restaurant than the existing cart, so the UI can offer a "clear cart?" confirmation rather than silently dropping items.';

revoke all on function public.add_to_cart(uuid, integer, text) from public;
grant execute on function public.add_to_cart(uuid, integer, text) to authenticated;

create or replace function public.update_cart_item_quantity(p_cart_item_id uuid, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be positive — use remove_cart_item to remove an item' using errcode = '22023';
  end if;

  update public.food_cart_items
  set quantity = p_quantity
  where id = p_cart_item_id
    and exists (select 1 from public.food_carts c where c.id = food_cart_items.cart_id and c.passenger_id = auth.uid());

  if not found then
    raise exception 'Cart item not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_cart_item_quantity(uuid, integer) from public;
grant execute on function public.update_cart_item_quantity(uuid, integer) to authenticated;

create or replace function public.remove_cart_item(p_cart_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cart_id uuid;
  v_remaining integer;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  delete from public.food_cart_items
  where id = p_cart_item_id
    and exists (select 1 from public.food_carts c where c.id = food_cart_items.cart_id and c.passenger_id = auth.uid())
  returning cart_id into v_cart_id;

  if v_cart_id is null then
    return;
  end if;

  select count(*) into v_remaining from public.food_cart_items where cart_id = v_cart_id;
  if v_remaining = 0 then
    delete from public.food_carts where id = v_cart_id;
  end if;
end;
$$;

revoke all on function public.remove_cart_item(uuid) from public;
grant execute on function public.remove_cart_item(uuid) to authenticated;

create or replace function public.clear_cart()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  delete from public.food_carts where passenger_id = auth.uid();
end;
$$;

revoke all on function public.clear_cart() from public;
grant execute on function public.clear_cart() to authenticated;

-- ----------------------------------------------------------------------------
-- get_cart_summary — returns the caller's cart re-priced from LIVE menu
-- item prices/availability (not the stored snapshot), so what the
-- Passenger app displays before checkout always matches what checkout
-- will actually charge. unavailable_items flags items that have gone
-- out-of-stock or been deactivated since being added, so the UI can warn
-- the passenger before they attempt to check out.
-- ----------------------------------------------------------------------------
create or replace function public.get_cart_summary()
returns table (
  cart_id uuid,
  restaurant_id uuid,
  cart_item_id uuid,
  menu_item_id uuid,
  item_name text,
  quantity integer,
  current_unit_price numeric,
  line_total numeric,
  is_available boolean,
  special_instructions text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as cart_id,
    c.restaurant_id,
    ci.id as cart_item_id,
    mi.id as menu_item_id,
    mi.name as item_name,
    ci.quantity,
    mi.price as current_unit_price,
    mi.price * ci.quantity as line_total,
    (mi.is_active and mi.is_available) as is_available,
    ci.special_instructions
  from public.food_carts c
  join public.food_cart_items ci on ci.cart_id = c.id
  join public.restaurant_menu_items mi on mi.id = ci.menu_item_id
  where c.passenger_id = auth.uid();
$$;

revoke all on function public.get_cart_summary() from public;
grant execute on function public.get_cart_summary() to authenticated;
