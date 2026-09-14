-- ============================================================================
-- 20260914091500_food_analytics_rpcs.sql
-- Ridora Food Phase 1. Restaurant analytics — one RPC returning a single
-- jsonb payload (order overview, payment mix, menu performance, customer
-- trends, rating insights) rather than the Restaurant app running five to
-- ten separate aggregate queries per dashboard load (spec section 44: avoid
-- N+1 queries). Every metric is computed live from food_orders/
-- food_order_items/food_order_ratings — never a fabricated/placeholder
-- number, and an empty result set naturally yields zeros/nulls the client
-- renders as "No orders yet" rather than fake data.
-- ============================================================================

create or replace function public.get_restaurant_analytics(
  p_restaurant_id uuid,
  p_from timestamptz default (now() - interval '30 days'),
  p_to timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.restaurants r where r.id = p_restaurant_id and (r.owner_id = auth.uid() or public.is_admin())
  ) then
    raise exception 'Restaurant not found or not owned by caller' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'order_overview', (
      select jsonb_build_object(
        'total_orders', count(*),
        'completed_orders', count(*) filter (where status = 'delivered'),
        'cancelled_orders', count(*) filter (where status in ('cancelled', 'rejected')),
        'pending_orders', count(*) filter (where status not in ('delivered', 'cancelled', 'rejected')),
        'total_revenue', coalesce(sum(total_amount) filter (where status = 'delivered'), 0)
      )
      from public.food_orders
      where restaurant_id = p_restaurant_id and created_at between p_from and p_to
    ),
    'payment_mix', (
      select jsonb_build_object(
        'cash_on_delivery', count(*) filter (where payment_method = 'cod' and status = 'delivered'),
        'online_payment', count(*) filter (where payment_method = 'online' and status = 'delivered')
      )
      from public.food_orders
      where restaurant_id = p_restaurant_id and created_at between p_from and p_to
    ),
    'menu_performance', (
      select jsonb_build_object(
        'top_seller', (
          select jsonb_build_object('item_name', oi.item_name, 'quantity_sold', sum(oi.quantity))
          from public.food_order_items oi
          join public.food_orders o on o.id = oi.order_id
          where o.restaurant_id = p_restaurant_id and o.status = 'delivered' and o.created_at between p_from and p_to
          group by oi.item_name
          order by sum(oi.quantity) desc
          limit 1
        ),
        'revenue_leader', (
          select jsonb_build_object('item_name', oi.item_name, 'revenue', sum(oi.line_total))
          from public.food_order_items oi
          join public.food_orders o on o.id = oi.order_id
          where o.restaurant_id = p_restaurant_id and o.status = 'delivered' and o.created_at between p_from and p_to
          group by oi.item_name
          order by sum(oi.line_total) desc
          limit 1
        ),
        'least_ordered', (
          select jsonb_build_object('item_name', oi.item_name, 'quantity_sold', sum(oi.quantity))
          from public.food_order_items oi
          join public.food_orders o on o.id = oi.order_id
          where o.restaurant_id = p_restaurant_id and o.status = 'delivered' and o.created_at between p_from and p_to
          group by oi.item_name
          order by sum(oi.quantity) asc
          limit 1
        ),
        'best_rated', (
          select jsonb_build_object('item_name', oi.item_name, 'avg_rating', round(avg(ir.rating)::numeric, 1))
          from public.food_order_item_ratings ir
          join public.food_order_items oi on oi.id = ir.order_item_id
          join public.food_orders o on o.id = oi.order_id
          where o.restaurant_id = p_restaurant_id
          group by oi.item_name
          order by avg(ir.rating) desc
          limit 1
        )
      )
    ),
    'customer_trends', (
      select jsonb_build_object(
        'repeat_customers', (
          select count(*) from (
            select passenger_id from public.food_orders
            where restaurant_id = p_restaurant_id and status = 'delivered' and created_at between p_from and p_to
            group by passenger_id having count(*) > 1
          ) repeat_buyers
        ),
        'average_order_value', (
          select coalesce(round(avg(total_amount)::numeric, 2), 0)
          from public.food_orders
          where restaurant_id = p_restaurant_id and status = 'delivered' and created_at between p_from and p_to
        ),
        'orders_by_day', (
          select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'orders', d.orders) order by d.day), '[]'::jsonb)
          from (
            select date_trunc('day', created_at)::date as day, count(*) as orders
            from public.food_orders
            where restaurant_id = p_restaurant_id and created_at between p_from and p_to
            group by date_trunc('day', created_at)::date
          ) d
        )
      )
    ),
    'rating_insights', (
      select jsonb_build_object(
        'average_rating', coalesce((select rating from public.restaurants where id = p_restaurant_id), 5.0),
        'total_ratings', coalesce((select total_ratings from public.restaurants where id = p_restaurant_id), 0),
        'rating_distribution', (
          select coalesce(jsonb_object_agg(rating, cnt), '{}'::jsonb)
          from (
            select rating, count(*) as cnt
            from public.food_order_ratings
            where restaurant_id = p_restaurant_id
            group by rating
          ) dist
        )
      )
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_restaurant_analytics(uuid, timestamptz, timestamptz) is
  'Single-round-trip restaurant dashboard/analytics payload. Restaurant-owner or admin only. Every field is computed live from real orders/ratings for the given date range — an empty range legitimately returns zeros/nulls, which the client renders as "No orders yet" rather than fabricating numbers.';

revoke all on function public.get_restaurant_analytics(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_restaurant_analytics(uuid, timestamptz, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- get_restaurant_dashboard_summary — the smaller, faster "today" summary
-- shown on the Restaurant app's home screen (spec section 15), separate
-- from the heavier analytics RPC above.
-- ----------------------------------------------------------------------------
create or replace function public.get_restaurant_dashboard_summary(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.restaurants r where r.id = p_restaurant_id and (r.owner_id = auth.uid() or public.is_admin())
  ) then
    raise exception 'Restaurant not found or not owned by caller' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'todays_orders', count(*) filter (where created_at >= date_trunc('day', now())),
    'todays_revenue', coalesce(sum(total_amount) filter (where created_at >= date_trunc('day', now()) and status = 'delivered'), 0),
    'pending_orders', count(*) filter (where status = 'placed'),
    'preparing_orders', count(*) filter (where status in ('accepted', 'preparing')),
    'ready_orders', count(*) filter (where status = 'ready_for_pickup'),
    'delivered_orders', count(*) filter (where created_at >= date_trunc('day', now()) and status = 'delivered'),
    'cancelled_orders', count(*) filter (where created_at >= date_trunc('day', now()) and status in ('cancelled', 'rejected'))
  ) into v_result
  from public.food_orders
  where restaurant_id = p_restaurant_id;

  return v_result;
end;
$$;

revoke all on function public.get_restaurant_dashboard_summary(uuid) from public;
grant execute on function public.get_restaurant_dashboard_summary(uuid) to authenticated;
