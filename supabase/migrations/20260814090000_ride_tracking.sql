-- ============================================================================
-- 20260814090000_ride_tracking.sql
-- Phase 9. Real finding, not anticipated in Phase 8: no function before
-- this ever needed to read a `geography` column BACK to a client as usable
-- lat/lng. Every prior use was either (a) a WKT text string on INSERT
-- (one-directional, application -> database) or (b) consumed entirely
-- server-side inside ST_Distance() calls for matching, never returned.
-- PostgREST serializes `geography` columns as WKB hex by default when
-- selected directly — not usable as {lat, lng} in JS without a WKB parser.
-- This RPC is the correct fix: decode server-side via ST_X/ST_Y, return
-- plain doubles, and enforce the exact same privacy boundary Phase 3/8
-- already established (ride's own passenger, its assigned driver, or an
-- admin) — explicitly, not just by relying on RLS on the underlying
-- tables, since this function necessarily reads across `rides` and
-- `drivers` together.
-- ============================================================================

create or replace function public.get_ride_tracking(p_ride_id uuid)
returns table (
  ride_id uuid,
  status public.ride_status_enum,
  pickup_lat double precision,
  pickup_lng double precision,
  drop_lat double precision,
  drop_lng double precision,
  driver_lat double precision,
  driver_lng double precision,
  driver_location_updated_at timestamptz,
  distance_to_pickup_meters double precision,
  distance_to_drop_meters double precision
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_passenger_id uuid;
  v_driver_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select r.passenger_id, r.driver_id into v_passenger_id, v_driver_id
  from public.rides r where r.id = p_ride_id;

  if v_passenger_id is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if not (v_passenger_id = auth.uid() or v_driver_id = auth.uid() or public.is_admin()) then
    raise exception 'Not authorized to view this ride''s tracking info' using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.status,
    ST_Y(r.pickup_location::geometry)::double precision,
    ST_X(r.pickup_location::geometry)::double precision,
    ST_Y(r.drop_location::geometry)::double precision,
    ST_X(r.drop_location::geometry)::double precision,
    case when d.current_location is not null then ST_Y(d.current_location::geometry)::double precision end,
    case when d.current_location is not null then ST_X(d.current_location::geometry)::double precision end,
    d.location_updated_at,
    case when d.current_location is not null then ST_Distance(d.current_location, r.pickup_location) end,
    case when d.current_location is not null then ST_Distance(d.current_location, r.drop_location) end
  from public.rides r
  left join public.drivers d on d.id = r.driver_id
  where r.id = p_ride_id;
end;
$$;

comment on function public.get_ride_tracking(uuid) is
  'Decodes pickup/drop/driver geography into plain lat/lng for a single ride, with an explicit authorization check (ride''s passenger, assigned driver, or admin only). This is the sanctioned way to read coordinates for map display — no client ever selects current_location/pickup_location/drop_location directly.';

revoke execute on function public.get_ride_tracking(uuid) from public;
grant execute on function public.get_ride_tracking(uuid) to authenticated;

-- Realtime signal only — the raw postgres_changes payload for a geography
-- column is still WKB hex, not usable lat/lng, so subscribers treat an
-- UPDATE event on `drivers` as "something changed, refetch via
-- get_ride_tracking()" rather than reading coordinates out of the payload
-- directly. RLS-scoped exactly as before: a passenger's subscription
-- filtered to their assigned driver's id only fires if
-- drivers_select_active_ride_passenger currently permits it.
alter publication supabase_realtime add table public.drivers;
