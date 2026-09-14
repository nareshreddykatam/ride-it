-- ============================================================================
-- 20260914091200_food_order_rpcs.sql
-- Ridora Food Phase 1. Restaurant discovery (server-side 15km radius),
-- menu retrieval, checkout, and restaurant/passenger order-lifecycle RPCs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- get_nearby_restaurants — the 15km radius rule, enforced here, not in
-- client JavaScript. ST_DWithin (index-accelerated via
-- restaurants_approved_location_idx) does the actual radius filter;
-- ST_Distance computes the real distance_km returned to the client — the
-- client never supplies or overrides a distance. Radius is admin-tunable
-- via app_settings('food_discovery_radius_meters'), defaulting to exactly
-- 15000m so out-of-the-box behavior matches the product rule.
-- ----------------------------------------------------------------------------
create or replace function public.get_nearby_restaurants(
  p_lat double precision,
  p_lng double precision,
  p_category_id uuid default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  restaurant_id uuid,
  name text,
  logo_path text,
  cover_image_path text,
  rating numeric,
  total_ratings integer,
  avg_preparation_minutes integer,
  distance_km numeric,
  is_open boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_origin extensions.geography;
  v_radius_meters integer;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  v_origin := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography;
  v_radius_meters := public._get_matching_setting_int('food_discovery_radius_meters', 15000);

  return query
    select
      r.id as restaurant_id,
      r.name,
      r.logo_path,
      r.cover_image_path,
      r.rating,
      r.total_ratings,
      r.avg_preparation_minutes,
      round((ST_Distance(r.location, v_origin) / 1000.0)::numeric, 2) as distance_km,
      r.is_open
    from public.restaurants r
    where r.status = 'approved'
      and r.deleted_at is null
      and ST_DWithin(r.location, v_origin, v_radius_meters)
      and exists (
        select 1 from public.restaurant_subscriptions s
        where s.restaurant_id = r.id and s.status = 'active' and s.expires_at > now()
      )
      and (p_category_id is null or exists (
        select 1 from public.restaurant_categories rc where rc.restaurant_id = r.id and rc.category_id = p_category_id
      ))
      and (p_search is null or r.name ilike '%' || p_search || '%')
    order by r.location <-> v_origin
    limit p_limit offset p_offset;
end;
$$;

revoke all on function public.get_nearby_restaurants(double precision, double precision, uuid, text, integer, integer) from public;
grant execute on function public.get_nearby_restaurants(double precision, double precision, uuid, text, integer, integer) to authenticated;

comment on function public.get_nearby_restaurants(double precision, double precision, uuid, text, integer, integer) is
  'Server-authoritative 15km (default, app_settings-configurable) restaurant discovery via ST_DWithin. A restaurant outside the radius, unapproved, closed-for-approval, or without an active subscription is never returned — never trust a client-computed distance or a client-side filter.';

-- ----------------------------------------------------------------------------
-- get_restaurant_menu — public restaurant detail + full active menu. The
-- owner/admin may preview a non-approved restaurant's own menu; anyone else
-- only ever sees an approved restaurant's menu.
-- ----------------------------------------------------------------------------
create or replace function public.get_restaurant_menu(p_restaurant_id uuid)
returns table (
  category_id uuid,
  category_name text,
  category_display_order integer,
  item_id uuid,
  item_name text,
  item_description text,
  price numeric,
  veg_type public.food_veg_type_enum,
  image_path text,
  is_available boolean,
  item_display_order integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.restaurants r
    where r.id = p_restaurant_id
      and (
        r.status = 'approved'
        or r.owner_id = auth.uid()
        or public.is_admin()
      )
  ) then
    raise exception 'Restaurant not found' using errcode = 'P0002';
  end if;

  return query
    select c.id, c.name, c.display_order, i.id, i.name, i.description, i.price, i.veg_type, i.image_path, i.is_available, i.display_order
    from public.restaurant_menu_categories c
    join public.restaurant_menu_items i on i.category_id = c.id and i.is_active = true
    where c.restaurant_id = p_restaurant_id and c.is_active = true
    order by c.display_order, i.display_order;
end;
$$;

revoke all on function public.get_restaurant_menu(uuid) from public;
grant execute on function public.get_restaurant_menu(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- _calculate_food_delivery_fee — a single, honest, admin-configurable
-- formula (base + per-km), the same "one function is the source of truth"
-- discipline _calculate_fare() applies to ride pricing. No commission/
-- platform cut is charged by default (food_platform_fee_flat defaults to
-- 0) — Food's Phase 1 platform revenue is the restaurant subscription, not
-- a per-order fee; Admin can turn one on later via app_settings without a
-- schema change.
-- ----------------------------------------------------------------------------
create or replace function public._calculate_food_delivery_fee(p_distance_km numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(
    (public._get_matching_setting_int('food_delivery_base_fee', 20)
     + public._get_matching_setting_int('food_delivery_per_km_fee', 5) * ceil(greatest(p_distance_km, 0)))::numeric,
    2
  );
$$;

revoke execute on function public._calculate_food_delivery_fee(numeric) from public;
revoke execute on function public._calculate_food_delivery_fee(numeric) from authenticated;

-- ----------------------------------------------------------------------------
-- create_food_order — checkout. Re-derives EVERYTHING server-side from the
-- passenger's own cart and the restaurant's current, live state:
--   - line items/prices: read fresh from restaurant_menu_items, never the
--     cart's cached unit_price_snapshot
--   - restaurant eligibility: approved + open + active subscription,
--     re-checked here (defense in depth beyond discovery-time filtering)
--   - delivery distance/fee: computed from the restaurant's real location
--     and the SUPPLIED delivery coordinates (validated within the same
--     15km radius as discovery — an order cannot be placed to an address
--     discovery itself would have excluded)
--   - recipient_phone: NOT NULL at the column level already; this function
--     additionally requires a non-blank value regardless of is_for_self,
--     matching the brief's "mandatory even for self" instruction literally
-- Clears the cart on success. Never accepts a client-supplied amount for
-- anything.
-- ----------------------------------------------------------------------------
create or replace function public.create_food_order(
  p_recipient_name text,
  p_recipient_phone text,
  p_is_for_self boolean,
  p_delivery_address text,
  p_delivery_landmark text,
  p_delivery_lat double precision,
  p_delivery_lng double precision,
  p_payment_method public.food_payment_method_enum,
  p_special_instructions text default null
)
returns public.food_orders
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_passenger_id uuid := auth.uid();
  v_cart public.food_carts%rowtype;
  v_restaurant public.restaurants%rowtype;
  v_item record;
  v_subtotal numeric(10, 2) := 0;
  v_delivery_fee numeric(10, 2);
  v_platform_fee numeric(10, 2);
  v_total numeric(10, 2);
  v_delivery_location extensions.geography;
  v_distance_km numeric(6, 2);
  v_radius_meters integer;
  v_order public.food_orders;
  v_item_count integer;
begin
  if v_passenger_id is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if p_recipient_phone is null or p_recipient_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'A valid recipient phone number is required' using errcode = '22023';
  end if;

  if p_recipient_name is null or length(trim(p_recipient_name)) = 0 then
    raise exception 'Recipient name is required' using errcode = '22023';
  end if;

  select * into v_cart from public.food_carts where passenger_id = v_passenger_id for update;
  if v_cart.id is null then
    raise exception 'Cart is empty' using errcode = 'P0001';
  end if;

  select count(*) into v_item_count from public.food_cart_items where cart_id = v_cart.id;
  if v_item_count = 0 then
    raise exception 'Cart is empty' using errcode = 'P0001';
  end if;

  select * into v_restaurant from public.restaurants where id = v_cart.restaurant_id for update;
  if v_restaurant.status != 'approved' or v_restaurant.deleted_at is not null then
    raise exception 'Restaurant is not currently accepting orders' using errcode = 'P0001';
  end if;

  if v_restaurant.is_open = false then
    raise exception 'Restaurant is currently closed' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.restaurant_subscriptions s
    where s.restaurant_id = v_restaurant.id and s.status = 'active' and s.expires_at > now()
  ) then
    raise exception 'Restaurant is not currently accepting orders' using errcode = 'P0001';
  end if;

  v_delivery_location := ST_SetSRID(ST_MakePoint(p_delivery_lng, p_delivery_lat), 4326)::extensions.geography;
  v_radius_meters := public._get_matching_setting_int('food_discovery_radius_meters', 15000);

  if not ST_DWithin(v_restaurant.location, v_delivery_location, v_radius_meters) then
    raise exception 'Delivery address is outside this restaurant''s delivery radius' using errcode = 'P0001';
  end if;

  v_distance_km := round((ST_Distance(v_restaurant.location, v_delivery_location) / 1000.0)::numeric, 2);

  -- Re-price every line from the LIVE menu item, not the cart's cached
  -- snapshot, and reject if anything has gone unavailable since it was
  -- added — the client is expected to have called get_cart_summary()
  -- beforehand to avoid this, but this is the authoritative re-check.
  for v_item in
    select ci.id as cart_item_id, ci.quantity, ci.special_instructions, mi.id as menu_item_id, mi.name, mi.description, mi.price, mi.veg_type, mi.is_active, mi.is_available
    from public.food_cart_items ci
    join public.restaurant_menu_items mi on mi.id = ci.menu_item_id
    where ci.cart_id = v_cart.id
  loop
    if v_item.is_active = false or v_item.is_available = false then
      raise exception 'Item "%" is no longer available — please update your cart', v_item.name using errcode = 'P0001';
    end if;
    v_subtotal := v_subtotal + (v_item.price * v_item.quantity);
  end loop;

  v_delivery_fee := public._calculate_food_delivery_fee(v_distance_km);
  v_platform_fee := public._get_matching_setting_int('food_platform_fee_flat', 0);
  v_total := v_subtotal + v_delivery_fee + v_platform_fee;

  insert into public.food_orders (
    passenger_id, restaurant_id, status, is_for_self, recipient_name, recipient_phone,
    delivery_address, delivery_landmark, delivery_location,
    restaurant_name_snapshot, restaurant_address_snapshot, restaurant_location, distance_km,
    subtotal_amount, delivery_fee, platform_fee, discount_amount, total_amount,
    payment_method, payment_status, special_instructions
  ) values (
    v_passenger_id, v_restaurant.id, 'placed', p_is_for_self, p_recipient_name, p_recipient_phone,
    p_delivery_address, p_delivery_landmark, v_delivery_location,
    v_restaurant.name, v_restaurant.address, v_restaurant.location, v_distance_km,
    v_subtotal, v_delivery_fee, v_platform_fee, 0, v_total,
    p_payment_method, 'pending', p_special_instructions
  )
  returning * into v_order;

  insert into public.food_order_items (order_id, menu_item_id, item_name, item_description, unit_price, quantity, line_total, veg_type, special_instructions)
  select v_order.id, mi.id, mi.name, mi.description, mi.price, ci.quantity, mi.price * ci.quantity, mi.veg_type, ci.special_instructions
  from public.food_cart_items ci
  join public.restaurant_menu_items mi on mi.id = ci.menu_item_id
  where ci.cart_id = v_cart.id;

  insert into public.food_order_status_history (order_id, status, actor_type, actor_id)
  values (v_order.id, 'placed', 'passenger', v_passenger_id);

  delete from public.food_carts where id = v_cart.id;

  perform public._create_notification(
    v_restaurant.owner_id,
    'food_order',
    'New order received',
    format('New order (₹%s) — %s item(s).', v_order.total_amount, v_item_count),
    jsonb_build_object('order_id', v_order.id)
  );

  perform public._create_notification(
    v_passenger_id,
    'food_order',
    'Order placed',
    format('Your order from %s has been placed.', v_restaurant.name),
    jsonb_build_object('order_id', v_order.id)
  );

  return v_order;
end;
$$;

comment on function public.create_food_order(text, text, boolean, text, text, double precision, double precision, public.food_payment_method_enum, text) is
  'Checkout. Re-derives every price from live menu data (never the cart cache or a client-supplied amount), re-validates restaurant eligibility and the 15km delivery radius server-side, snapshots restaurant/recipient/delivery details onto the order, and clears the cart.';

revoke all on function public.create_food_order(text, text, boolean, text, text, double precision, double precision, public.food_payment_method_enum, text) from public;
grant execute on function public.create_food_order(text, text, boolean, text, text, double precision, double precision, public.food_payment_method_enum, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Restaurant-side status transitions. Each is a narrow, single-purpose
-- SECURITY DEFINER function restricted to the owning restaurant's owner,
-- matching the ride side's philosophy of one function per legitimate
-- transition rather than one generic "update status" RPC.
-- ----------------------------------------------------------------------------
create or replace function public.restaurant_accept_order(p_order_id uuid)
returns public.food_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.food_orders;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select o.* into v_order
  from public.food_orders o
  join public.restaurants r on r.id = o.restaurant_id
  where o.id = p_order_id and r.owner_id = auth.uid()
  for update;

  if v_order.id is null then
    raise exception 'Order not found or not owned by caller' using errcode = '42501';
  end if;

  if v_order.status != 'placed' then
    raise exception 'Order is not awaiting acceptance' using errcode = 'P0001';
  end if;

  if v_order.payment_method = 'online' and v_order.payment_status != 'paid' then
    raise exception 'Cannot accept an online order before payment is confirmed' using errcode = 'P0001';
  end if;

  perform public._mark_trusted_write();
  update public.food_orders set status = 'accepted', accepted_at = now() where id = p_order_id
  returning * into v_order;

  insert into public.food_order_status_history (order_id, status, actor_type, actor_id)
  values (p_order_id, 'accepted', 'restaurant', auth.uid());

  perform public._create_notification(v_order.passenger_id, 'food_order', 'Order accepted', 'The restaurant has accepted your order.', jsonb_build_object('order_id', p_order_id));

  return v_order;
end;
$$;

revoke all on function public.restaurant_accept_order(uuid) from public;
grant execute on function public.restaurant_accept_order(uuid) to authenticated;

create or replace function public.restaurant_reject_order(p_order_id uuid, p_reason text)
returns public.food_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.food_orders;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required to reject an order' using errcode = '22023';
  end if;

  select o.* into v_order
  from public.food_orders o
  join public.restaurants r on r.id = o.restaurant_id
  where o.id = p_order_id and r.owner_id = auth.uid()
  for update;

  if v_order.id is null then
    raise exception 'Order not found or not owned by caller' using errcode = '42501';
  end if;

  if v_order.status not in ('placed', 'accepted') then
    raise exception 'Order can no longer be rejected' using errcode = 'P0001';
  end if;

  perform public._mark_trusted_write();
  update public.food_orders
  set status = 'rejected', cancelled_by = 'restaurant', cancellation_reason = p_reason, cancelled_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.food_order_status_history (order_id, status, actor_type, actor_id, notes)
  values (p_order_id, 'rejected', 'restaurant', auth.uid(), p_reason);

  perform public._create_notification(v_order.passenger_id, 'food_order', 'Order rejected', format('The restaurant could not accept your order: %s', p_reason), jsonb_build_object('order_id', p_order_id));

  return v_order;
end;
$$;

revoke all on function public.restaurant_reject_order(uuid, text) from public;
grant execute on function public.restaurant_reject_order(uuid, text) to authenticated;

create or replace function public.restaurant_mark_preparing(p_order_id uuid)
returns public.food_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.food_orders;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  perform public._mark_trusted_write();

  update public.food_orders o
  set status = 'preparing', preparing_at = now()
  from public.restaurants r
  where o.id = p_order_id and r.id = o.restaurant_id and r.owner_id = auth.uid() and o.status = 'accepted'
  returning o.* into v_order;

  if v_order.id is null then
    raise exception 'Order not found, not owned by caller, or not accepted yet' using errcode = 'P0001';
  end if;

  insert into public.food_order_status_history (order_id, status, actor_type, actor_id)
  values (p_order_id, 'preparing', 'restaurant', auth.uid());

  perform public._create_notification(v_order.passenger_id, 'food_order', 'Preparing your order', 'The restaurant has started preparing your order.', jsonb_build_object('order_id', p_order_id));

  return v_order;
end;
$$;

revoke all on function public.restaurant_mark_preparing(uuid) from public;
grant execute on function public.restaurant_mark_preparing(uuid) to authenticated;

create or replace function public.restaurant_mark_ready(p_order_id uuid)
returns public.food_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.food_orders;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  perform public._mark_trusted_write();

  update public.food_orders o
  set status = 'ready_for_pickup', ready_at = now()
  from public.restaurants r
  where o.id = p_order_id and r.id = o.restaurant_id and r.owner_id = auth.uid() and o.status = 'preparing'
  returning o.* into v_order;

  if v_order.id is null then
    raise exception 'Order not found, not owned by caller, or not currently preparing' using errcode = 'P0001';
  end if;

  perform public._mark_trusted_write();
  update public.restaurants set total_orders = total_orders + 1 where id = v_order.restaurant_id;

  insert into public.food_order_status_history (order_id, status, actor_type, actor_id)
  values (p_order_id, 'ready_for_pickup', 'restaurant', auth.uid());

  perform public._create_notification(v_order.passenger_id, 'food_order', 'Order ready', 'Your order is ready and awaiting a delivery partner.', jsonb_build_object('order_id', p_order_id));

  perform public.dispatch_next_food_batch(p_order_id);

  return v_order;
end;
$$;

revoke all on function public.restaurant_mark_ready(uuid) from public;
grant execute on function public.restaurant_mark_ready(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- passenger_cancel_food_order — only while the restaurant has not yet
-- accepted (mirrors passenger_cancel_matching_ride's "only during the
-- pre-commitment phase" scope).
-- ----------------------------------------------------------------------------
create or replace function public.passenger_cancel_food_order(p_order_id uuid, p_reason text default 'Passenger cancelled')
returns public.food_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.food_orders;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  perform public._mark_trusted_write();

  update public.food_orders
  set status = 'cancelled', cancelled_by = 'passenger', cancellation_reason = p_reason, cancelled_at = now()
  where id = p_order_id and passenger_id = auth.uid() and status = 'placed'
  returning * into v_order;

  if v_order.id is null then
    raise exception 'Order can no longer be cancelled' using errcode = 'P0001';
  end if;

  insert into public.food_order_status_history (order_id, status, actor_type, actor_id, notes)
  values (p_order_id, 'cancelled', 'passenger', auth.uid(), p_reason);

  perform public._create_notification(
    (select owner_id from public.restaurants where id = v_order.restaurant_id),
    'food_order', 'Order cancelled', format('Order cancelled by the customer: %s', p_reason), jsonb_build_object('order_id', p_order_id)
  );

  return v_order;
end;
$$;

revoke all on function public.passenger_cancel_food_order(uuid, text) from public;
grant execute on function public.passenger_cancel_food_order(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_cancel_food_order — override, any non-terminal state.
-- ----------------------------------------------------------------------------
create or replace function public.admin_cancel_food_order(p_order_id uuid, p_reason text)
returns public.food_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.food_orders;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can force-cancel an order' using errcode = '42501';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  perform public._mark_trusted_write();

  update public.food_orders
  set status = 'cancelled', cancelled_by = 'admin', cancellation_reason = p_reason, cancelled_at = now()
  where id = p_order_id and status not in ('delivered', 'cancelled', 'rejected')
  returning * into v_order;

  if v_order.id is null then
    raise exception 'Order not found or already in a terminal state' using errcode = 'P0001';
  end if;

  insert into public.food_order_status_history (order_id, status, actor_type, actor_id, notes)
  values (p_order_id, 'cancelled', 'admin', auth.uid(), p_reason);

  return v_order;
end;
$$;

revoke all on function public.admin_cancel_food_order(uuid, text) from public;
grant execute on function public.admin_cancel_food_order(uuid, text) to authenticated;
