-- ============================================================================
-- 20260903094500_pre_ride_fare_quote.sql
--
-- Adds a server-authoritative PRE-RIDE fare quote, reusing the exact same
-- calculation compute_ride_fare() (20260831110000_server_authoritative_fare_
-- calculation.sql, amended by 20260831130000_surge_pricing.sql) already
-- applies at ride-creation time — no second pricing engine.
--
-- Root cause being fixed: compute_ride_fare() is a BEFORE INSERT trigger
-- on public.rides — it can only ever run once a ride row is already being
-- created. There was no way to ask "what would this ride cost right now"
-- without actually creating the ride. So the booking screens
-- (apps/passenger/app/booking/{page,confirm/page}.tsx) computed their own
-- client-side estimate (computeFareEstimate(), @ride-it/utils/fare.ts)
-- from the raw pricing_rules/surge rows — a SEPARATE implementation of
-- the same formula, kept "bit-for-bit identical" by hand rather than by
-- construction. That's exactly the "frontend formula A / backend formula
-- B" duplication this migration removes.
--
-- Fix: extract compute_ride_fare()'s calculation into a pure function,
-- _calculate_fare(), that takes the same inputs the trigger already reads
-- off NEW.* and returns the same four fields. compute_ride_fare() is
-- refactored to call it — byte-for-byte the same exceptions, the same
-- pricing_rules row selection (city-specific preferred over city-null),
-- the same surge computation, the same rounding — so ride creation's
-- behavior is completely unchanged. A new RPC, get_fare_quote(), calls the
-- same pure function for a hypothetical (not-yet-created) ride, giving the
-- booking screens a real server quote before "Find Ride" without
-- duplicating a single line of pricing logic.
--
-- Security: get_fare_quote() requires authentication (auth.uid() check)
-- but is not scoped to any particular ride (there isn't one yet) — it
-- only ever returns a computed price, never accepts one. The client
-- supplies route inputs (vehicle type, pickup/drop coordinates, distance)
-- exactly as it already does for createRide() itself; the server is what
-- turns those into money, both here and at ride-creation time.
-- ============================================================================

create or replace function public._calculate_fare(
  p_vehicle_type public.vehicle_type_enum,
  p_city_id uuid,
  p_pickup_location extensions.geography,
  p_drop_location extensions.geography,
  p_distance_km numeric
)
returns table (
  base_fare numeric,
  distance_fare numeric,
  surge_multiplier numeric,
  total_fare numeric
)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_rule public.pricing_rules;
  v_straight_line_km numeric;
  v_raw_base numeric;
  v_raw_distance numeric;
  v_surge_enabled boolean;
  v_surge_starts timestamptz;
  v_surge_ends timestamptz;
  v_surge_max numeric;
  v_effective_multiplier numeric := 1.00;
begin
  if p_distance_km is null then
    raise exception 'distance_km is required to compute fare' using errcode = '23514';
  end if;

  v_straight_line_km := ST_Distance(p_pickup_location, p_drop_location) / 1000.0;
  if p_distance_km < v_straight_line_km - 0.1 then
    raise exception 'distance_km (%) is implausibly short for this pickup/drop pair (straight-line distance is %km)',
      p_distance_km, round(v_straight_line_km::numeric, 2)
      using errcode = '23514';
  end if;

  select *
  into v_rule
  from public.pricing_rules
  where vehicle_type = p_vehicle_type
    and is_active = true
    and deleted_at is null
    and effective_from <= now()
    and (effective_to is null or effective_to > now())
    and (city_id is null or city_id = p_city_id)
  order by (city_id is null) asc
  limit 1;

  if v_rule.id is null then
    raise exception 'No active pricing rule for vehicle type %', p_vehicle_type using errcode = 'P0002';
  end if;

  v_raw_base := v_rule.base_fare;
  v_raw_distance := round(v_rule.per_km_rate * p_distance_km);

  -- Surge: identical admin-configured server state compute_ride_fare()
  -- itself reads — never anything the client sent, here or there.
  v_surge_enabled := public._get_app_setting_bool('surge_enabled', false);
  if v_surge_enabled then
    v_surge_starts := public._get_app_setting_timestamptz('surge_starts_at', null);
    v_surge_ends := public._get_app_setting_timestamptz('surge_ends_at', null);

    if (v_surge_starts is null or now() >= v_surge_starts)
       and (v_surge_ends is null or now() <= v_surge_ends) then
      v_surge_max := public._get_app_setting_numeric('surge_max_multiplier', 2.00);
      v_effective_multiplier := least(greatest(v_rule.surge_multiplier, 1.00), v_surge_max, 5.00);
    end if;
  end if;

  base_fare := round(v_raw_base * v_effective_multiplier, 2);
  distance_fare := round(v_raw_distance * v_effective_multiplier, 2);
  surge_multiplier := v_effective_multiplier;
  total_fare := base_fare + distance_fare;
  return next;
end;
$$;

-- compute_ride_fare(): now a thin wrapper around _calculate_fare() —
-- identical inputs (NEW.*), identical outputs assigned onto NEW, identical
-- discount_amount handling. Ride creation's behavior does not change.
create or replace function public.compute_ride_fare()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_quote record;
begin
  select * into v_quote
  from public._calculate_fare(new.vehicle_type, new.city_id, new.pickup_location, new.drop_location, new.distance_km);

  new.base_fare := v_quote.base_fare;
  new.distance_fare := v_quote.distance_fare;
  new.discount_amount := coalesce(new.discount_amount, 0);
  new.total_fare := new.base_fare + new.distance_fare - new.discount_amount;
  new.surge_multiplier := v_quote.surge_multiplier;

  return new;
end;
$$;

-- get_fare_quote(): the new pre-ride entry point. Same coordinate/distance
-- shape createRide() already sends (packages/data/src/rides.ts) — WKT-free
-- here since PostgREST/postgres.js pass plain lat/lng, converted to the
-- same geography points _calculate_fare() (and the trigger) operate on.
create or replace function public.get_fare_quote(
  p_vehicle_type public.vehicle_type_enum,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_drop_lat double precision,
  p_drop_lng double precision,
  p_distance_km numeric,
  p_city_id uuid default null
)
returns table (
  base_fare numeric,
  distance_fare numeric,
  surge_multiplier numeric,
  total_fare numeric
)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  return query
  select *
  from public._calculate_fare(
    p_vehicle_type,
    p_city_id,
    ST_SetSRID(ST_MakePoint(p_pickup_lng, p_pickup_lat), 4326)::extensions.geography,
    ST_SetSRID(ST_MakePoint(p_drop_lng, p_drop_lat), 4326)::extensions.geography,
    p_distance_km
  );
end;
$$;

comment on function public.get_fare_quote(public.vehicle_type_enum, double precision, double precision, double precision, double precision, numeric, uuid) is
  'Server-authoritative pre-ride fare quote. Uses the exact same calculation as compute_ride_fare() (via the shared _calculate_fare() helper) — never a second pricing formula. Requires authentication; never accepts a client-supplied fare.';

grant execute on function public.get_fare_quote(public.vehicle_type_enum, double precision, double precision, double precision, double precision, numeric, uuid) to authenticated;
