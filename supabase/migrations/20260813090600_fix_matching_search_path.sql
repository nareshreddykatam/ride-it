-- ============================================================================
-- 20260813090600_fix_matching_search_path.sql
-- UPDATED NOTE: the fix this migration documents now also lives directly
-- in 20260813090300_matching_engine.sql's original CREATE FUNCTION
-- statement (corrected there after a real `supabase db push` against the
-- actual Ride It Supabase project failed with exactly the error this
-- file's original comment predicted from static review alone: `function
-- st_distance(...) does not exist`). That fix at the source means this
-- migration's CREATE OR REPLACE below is now redundant — it re-applies
-- an already-correct function definition — but it is left in place
-- unchanged rather than removed: it was never applied to any real
-- environment either (the chain never reached it before the 090300
-- failure), it is harmless as a no-op, and removing it would erase a
-- real record of how this bug was originally found (by careful re-read,
-- before any live database existed to catch it) versus how it was
-- ultimately confirmed (by an actual failed cloud deployment). Original
-- comment preserved below for that reason.
--
-- Found during a careful re-read (no live Postgres available to catch this
-- by actually running it — see Phase 8 review doc): PostGIS was installed
-- into the `extensions` schema (migration 20260803120000), not `public`.
-- Every function before this phase only ever used the `geography` *type*
-- (e.g. column definitions, WKT text cast on insert from the application
-- layer) — none called a PostGIS *function* internally. _find_eligible_drivers
-- is the first to call ST_Distance() and use the `<->` KNN operator inside
-- a SECURITY DEFINER function, and its search_path was set to `public`
-- only — those calls would fail to resolve at runtime with "function/
-- operator does not exist" against a real database.
-- ============================================================================

create or replace function public._find_eligible_drivers(p_ride_id uuid, p_batch_size integer)
returns table (driver_id uuid, distance_meters double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    d.id as driver_id,
    ST_Distance(d.current_location, r.pickup_location) as distance_meters
  from public.rides r
  join public.drivers d
    on d.vehicle_type = r.vehicle_type
   and d.is_online = true
   and d.verification_status = 'approved'
   and d.current_location is not null
   and d.location_updated_at is not null
   and d.location_updated_at > now() - (public._get_matching_setting_int('driver_location_freshness_seconds', 120) || ' seconds')::interval
   and (r.city_id is null or d.current_city_id = r.city_id)
  where r.id = p_ride_id
    and not exists (
      select 1 from public.rides r2
      where r2.driver_id = d.id and r2.status not in ('ride_completed', 'cancelled', 'rated')
    )
    and not exists (
      select 1 from public.ride_offers o
      where o.ride_id = r.id and o.driver_id = d.id
    )
    and not exists (
      select 1 from public.ride_offers o2
      where o2.driver_id = d.id and o2.status = 'pending' and o2.expires_at > now()
    )
  order by d.current_location <-> r.pickup_location
  limit p_batch_size;
$$;

comment on function public._find_eligible_drivers(uuid, integer) is
  'search_path includes extensions (Phase 8 fix) so ST_Distance/<-> resolve — PostGIS lives in extensions, not public. Internal only, no client-facing execute grant.';
