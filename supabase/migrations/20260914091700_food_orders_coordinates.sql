-- ============================================================================
-- 20260914091700_food_orders_coordinates.sql
-- Ridora Food Phase 1. PostgREST computed columns exposing food_orders'
-- geography columns as plain lat/lng — same idiom as saved_places_lat()/
-- saved_places_lng() (20260824090000): a raw REST/PostgREST select of a
-- geography column returns undecoded WKB, not usable coordinates, so the
-- Driver app's active-delivery navigation card needs this to read real
-- restaurant/delivery coordinates without a dedicated RPC for something
-- this simple.
-- ============================================================================

create or replace function public.food_orders_restaurant_lat(public.food_orders)
returns double precision
language sql
stable
set search_path = public, extensions
as $$
  select ST_Y($1.restaurant_location::geometry);
$$;

create or replace function public.food_orders_restaurant_lng(public.food_orders)
returns double precision
language sql
stable
set search_path = public, extensions
as $$
  select ST_X($1.restaurant_location::geometry);
$$;

create or replace function public.food_orders_delivery_lat(public.food_orders)
returns double precision
language sql
stable
set search_path = public, extensions
as $$
  select ST_Y($1.delivery_location::geometry);
$$;

create or replace function public.food_orders_delivery_lng(public.food_orders)
returns double precision
language sql
stable
set search_path = public, extensions
as $$
  select ST_X($1.delivery_location::geometry);
$$;

comment on function public.food_orders_restaurant_lat(public.food_orders) is
  'PostgREST computed column: food_orders.restaurant_lat. Selectable as ".../food_orders?select=...,restaurant_lat:food_orders_restaurant_lat,restaurant_lng:food_orders_restaurant_lng".';

revoke execute on function public.food_orders_restaurant_lat(public.food_orders) from public;
grant execute on function public.food_orders_restaurant_lat(public.food_orders) to authenticated;
revoke execute on function public.food_orders_restaurant_lng(public.food_orders) from public;
grant execute on function public.food_orders_restaurant_lng(public.food_orders) to authenticated;
revoke execute on function public.food_orders_delivery_lat(public.food_orders) from public;
grant execute on function public.food_orders_delivery_lat(public.food_orders) to authenticated;
revoke execute on function public.food_orders_delivery_lng(public.food_orders) from public;
grant execute on function public.food_orders_delivery_lng(public.food_orders) to authenticated;
