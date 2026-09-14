-- ============================================================================
-- 20260914091400_food_ratings.sql
-- Ridora Food Phase 1. Order/restaurant rating + optional per-item rating.
-- Public SELECT is intentional (social proof on the restaurant page, same
-- as any consumer food app) — only INSERT is restricted, and only via the
-- submit_food_order_rating RPC below, never a raw client INSERT policy.
-- ============================================================================

create table public.food_order_ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.food_orders (id) on delete cascade,
  passenger_id uuid not null references public.passengers (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  rating smallint not null,
  comment text,
  created_at timestamptz not null default now(),
  constraint food_order_ratings_rating_range check (rating >= 1 and rating <= 5)
);

create index food_order_ratings_restaurant_idx on public.food_order_ratings (restaurant_id, created_at desc);

comment on table public.food_order_ratings is 'One overall rating per delivered order. unique(order_id) prevents duplicate ratings — see submit_food_order_rating for the authorization/eligibility checks.';

alter table public.food_order_ratings enable row level security;

create policy "food_order_ratings_select_all" on public.food_order_ratings
  for select using (true);

create policy "food_order_ratings_all_admin" on public.food_order_ratings
  for all using (public.is_admin()) with check (public.is_admin());

create table public.food_order_item_ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.food_orders (id) on delete cascade,
  order_item_id uuid not null unique references public.food_order_items (id) on delete cascade,
  passenger_id uuid not null references public.passengers (id) on delete cascade,
  rating smallint not null,
  created_at timestamptz not null default now(),
  constraint food_order_item_ratings_rating_range check (rating >= 1 and rating <= 5)
);

create index food_order_item_ratings_order_item_idx on public.food_order_item_ratings (order_item_id);

comment on table public.food_order_item_ratings is 'Optional per-dish rating, one per order line item.';

alter table public.food_order_item_ratings enable row level security;

create policy "food_order_item_ratings_select_all" on public.food_order_item_ratings
  for select using (true);

create policy "food_order_item_ratings_all_admin" on public.food_order_item_ratings
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- submit_food_order_rating — the only path that can create a rating.
-- Requires: caller is the order's own passenger, the order is delivered,
-- and it has not already been rated (unique(order_id) would also catch a
-- second attempt, but the explicit check gives a clean error rather than
-- a raw constraint violation). Updates the restaurant's denormalized
-- rating/total_ratings via a trusted write, mirroring how rides denormalize
-- passenger_rating/driver_rating from the normalized ratings table.
-- p_item_ratings is an optional jsonb array of {order_item_id, rating}.
-- ----------------------------------------------------------------------------
create or replace function public.submit_food_order_rating(
  p_order_id uuid,
  p_rating smallint,
  p_comment text default null,
  p_item_ratings jsonb default null
)
returns public.food_order_ratings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.food_orders;
  v_rating public.food_order_ratings;
  v_item jsonb;
  v_avg numeric(2, 1);
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5' using errcode = '22023';
  end if;

  select * into v_order from public.food_orders where id = p_order_id;
  if v_order.id is null or v_order.passenger_id != auth.uid() then
    raise exception 'Order not found or not owned by caller' using errcode = '42501';
  end if;

  if v_order.status != 'delivered' then
    raise exception 'Only a delivered order can be rated' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.food_order_ratings where order_id = p_order_id) then
    raise exception 'This order has already been rated' using errcode = 'P0001';
  end if;

  insert into public.food_order_ratings (order_id, passenger_id, restaurant_id, rating, comment)
  values (p_order_id, auth.uid(), v_order.restaurant_id, p_rating, p_comment)
  returning * into v_rating;

  if p_item_ratings is not null then
    for v_item in select * from jsonb_array_elements(p_item_ratings)
    loop
      insert into public.food_order_item_ratings (order_id, order_item_id, passenger_id, rating)
      select p_order_id, (v_item->>'order_item_id')::uuid, auth.uid(), (v_item->>'rating')::smallint
      where exists (select 1 from public.food_order_items oi where oi.id = (v_item->>'order_item_id')::uuid and oi.order_id = p_order_id)
      on conflict (order_item_id) do nothing;
    end loop;
  end if;

  select round(avg(rating)::numeric, 1), count(*) into v_avg, v_count
  from public.food_order_ratings
  where restaurant_id = v_order.restaurant_id;

  perform public._mark_trusted_write();
  update public.restaurants set rating = coalesce(v_avg, 5.0), total_ratings = v_count where id = v_order.restaurant_id;

  return v_rating;
end;
$$;

comment on function public.submit_food_order_rating(uuid, smallint, text, jsonb) is
  'Only the order''s own passenger, only after delivery, only once. Recomputes restaurants.rating/total_ratings from the full food_order_ratings set (a straightforward COUNT/AVG, not an incremental running average, since Food ratings volume does not need the optimization the ride side might).';

revoke all on function public.submit_food_order_rating(uuid, smallint, text, jsonb) from public;
grant execute on function public.submit_food_order_rating(uuid, smallint, text, jsonb) to authenticated;
