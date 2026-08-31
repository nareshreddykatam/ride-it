-- ============================================================================
-- 20260831110000_server_authoritative_fare_calculation.sql
--
-- REAL VULNERABILITY FOUND (verified by reading the current source, not
-- assumed): rides_insert_passenger's RLS policy only checks
-- `passenger_id = auth.uid()` (20260803121100_row_level_security.sql) —
-- it never validates base_fare/distance_fare/total_fare against anything.
-- protect_ride_financial_columns() (20260816090000) only fires
-- `before update`, referencing OLD.*, so it does nothing at INSERT time.
-- packages/data/src/rides.ts's createRide() does a plain client-side
-- `.insert()` with base_fare/distance_fare/total_fare computed entirely in
-- the browser (packages/utils/src/fare.ts's FARE_RATES — itself explicitly
-- commented in 20260803120500_pricing_and_promotions.sql as "a frontend
-- mirror... this table [pricing_rules] is the source of truth once the app
-- is wired to Supabase", i.e. a known, documented, still-open gap). Net
-- effect: any passenger with their own valid session can INSERT a ride
-- with an arbitrary total_fare (₹0, negative before the existing
-- non-negative CHECK constraints catch it, or simply far below the real
-- rate) via the REST API directly — the official app's UI is not the only
-- way to reach this table, and RLS/triggers are the only layer that can't
-- be bypassed by a technical passenger.
--
-- FIX: a BEFORE INSERT trigger that recomputes base_fare/distance_fare/
-- total_fare from pricing_rules (the table that already exists for exactly
-- this purpose and was already unused) and silently OVERWRITES whatever
-- the client sent — the same "server is authoritative, client input for
-- this field is discarded" pattern already used by
-- set_driver_location_timestamp() (20260813090500) for location_updated_at.
-- No new table, no new column — pricing_rules and the geography columns
-- used for the distance sanity check both already exist.
--
-- This does NOT implement surge/dynamic pricing and does NOT change the
-- fare formula (base + per-km, no surge) — it only moves the SAME formula
-- from "computed by the browser, trusted blindly" to "computed by the
-- database, using the same rates the browser was already mirroring".
-- Honest passengers seeing @ride-it/utils's FARE_RATES-based estimate
-- before confirming will see the database's real pricing_rules-derived
-- number afterward — these only diverge if an admin has actually changed
-- pricing_rules since @ride-it/utils/src/fare.ts's mirror was last synced,
-- which is a pre-existing, separate staleness issue this migration does
-- not attempt to fix (that's a legitimate future task: wire the booking
-- screens to read pricing_rules directly instead of a hardcoded mirror).
--
-- IMPORTANT DISCOVERY WHILE VERIFYING THIS FIX: querying the live table
-- before writing this migration found active global (city_id is null)
-- pricing_rules rows for ONLY 'scooty' and 'car' — none for 'bike' or
-- 'auto', despite both being live, commonly-booked vehicle types (auto is
-- the booking screen's own default/"Popular" option). Enforcing the
-- trigger below without first fixing this would immediately break booking
-- for those two vehicle types. The two INSERTs right after this comment
-- seed exactly the same rates @ride-it/utils/src/fare.ts's FARE_RATES
-- already charges today (bike: base 15, per-km 6; auto: base 25, per-km
-- 12) — this changes nothing about what a passenger pays, it only moves
-- the already-live numbers into the table that is supposed to be the
-- source of truth, per this migration's own stated purpose.
-- ============================================================================

insert into public.pricing_rules (city_id, vehicle_type, base_fare, per_km_rate, cancellation_fee, is_active)
values
  (null, 'bike', 15.00, 6.00, 0, true),
  (null, 'auto', 25.00, 12.00, 0, true)
on conflict (coalesce(city_id, '00000000-0000-0000-0000-000000000000'::uuid), vehicle_type)
  where is_active = true and effective_to is null and deleted_at is null
  do nothing;

create or replace function public.compute_ride_fare()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rule public.pricing_rules;
  v_straight_line_km numeric;
begin
  if new.distance_km is null then
    raise exception 'distance_km is required to compute fare' using errcode = '23514';
  end if;

  -- A real road route can never be shorter than the straight-line distance
  -- between pickup and drop — both are already stored as real PostGIS
  -- geography points on this same row, so this cross-checks existing data
  -- rather than inventing any. 0.1km tolerance absorbs GPS/rounding noise;
  -- it does not weaken the check meaningfully (a genuine fare-reduction
  -- attempt would understate distance by far more than 100m to matter).
  -- No upper bound: real routes can legitimately be much longer than
  -- straight-line (one-ways, detours), and overstating your OWN distance
  -- doesn't benefit the passenger paying for it, so an upper clamp would
  -- only risk false-positive rejections with no real security benefit.
  v_straight_line_km := ST_Distance(new.pickup_location, new.drop_location) / 1000.0;
  if new.distance_km < v_straight_line_km - 0.1 then
    raise exception 'distance_km (%) is implausibly short for this pickup/drop pair (straight-line distance is %km)',
      new.distance_km, round(v_straight_line_km::numeric, 2)
      using errcode = '23514';
  end if;

  -- Prefer a city-specific active rule over the global (city_id is null)
  -- default, matching pricing_rules_one_active_per_city_vehicle_idx's own
  -- notion of "the" active rule for a given city/vehicle pairing. When the
  -- ride itself has no city_id (the current booking flow's normal case —
  -- see createRide()'s own doc comment), only global rules ever qualify.
  select *
  into v_rule
  from public.pricing_rules
  where vehicle_type = new.vehicle_type
    and is_active = true
    and deleted_at is null
    and effective_from <= now()
    and (effective_to is null or effective_to > now())
    and (city_id is null or city_id = new.city_id)
  order by (city_id is null) asc
  limit 1;

  if v_rule.id is null then
    raise exception 'No active pricing rule for vehicle type %', new.vehicle_type using errcode = 'P0002';
  end if;

  new.base_fare := v_rule.base_fare;
  new.distance_fare := round(v_rule.per_km_rate * new.distance_km);
  new.discount_amount := coalesce(new.discount_amount, 0);
  -- Matches rides_total_fare_matches_components's own formula exactly —
  -- the CHECK constraint is the ultimate backstop if this trigger and that
  -- constraint were ever to disagree, but they're written to agree.
  new.total_fare := new.base_fare + new.distance_fare - new.discount_amount;

  return new;
end;
$$;

drop trigger if exists compute_ride_fare on public.rides;
create trigger compute_ride_fare
  before insert on public.rides
  for each row execute function public.compute_ride_fare();

revoke all on function public.compute_ride_fare() from public;

comment on function public.compute_ride_fare() is
  'Server-authoritative fare calculation, fired before every insert into rides — recomputes base_fare/distance_fare/total_fare from the active pricing_rules row for the ride''s vehicle_type/city_id, discarding whatever the client sent, and rejects a distance_km implausibly shorter than the real straight-line distance between pickup and drop. Closes a real gap where rides_insert_passenger''s RLS only checked passenger_id ownership, never fare correctness, and protect_ride_financial_columns() only guards UPDATE, not INSERT.';
