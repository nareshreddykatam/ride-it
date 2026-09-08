-- ============================================================================
-- 20260908060100_ride_tracking_speed_fields.sql
-- Extends get_ride_tracking() (20260814090000_ride_tracking.sql) with the
-- driver's live speed, guarded by ride status exactly like every other
-- driver-derived field in this function already is guarded by the left
-- join -- so a stale speed_kmh value left over from a since-completed ride
-- is never returned once the ride has moved on to a non-active status.
-- Same signature -> CREATE OR REPLACE preserves the existing
-- REVOKE .../GRANT ... TO authenticated state; no need to reissue.
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
  distance_to_drop_meters double precision,
  driver_speed_kmh numeric,
  driver_speed_updated_at timestamptz
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
    case when d.current_location is not null then ST_Distance(d.current_location, r.drop_location) end,
    case when r.status in ('ride_started', 'destination_reached', 'payment_collected') then d.speed_kmh end,
    case when r.status in ('ride_started', 'destination_reached', 'payment_collected') then d.speed_updated_at end
  from public.rides r
  left join public.drivers d on d.id = r.driver_id
  where r.id = p_ride_id;
end;
$$;

comment on function public.get_ride_tracking(uuid) is
  'Decodes pickup/drop/driver geography into plain lat/lng for a single ride, with an explicit authorization check (ride''s passenger, assigned driver, or admin only), plus the driver''s live speed (km/h) -- speed fields are null unless the ride is currently in an active status (ride_started/destination_reached/payment_collected), even if drivers.speed_kmh still holds a stale value from a prior ride. This is the sanctioned way to read coordinates/speed for map/speedometer display -- no client ever selects current_location/pickup_location/drop_location/speed_kmh directly.';
