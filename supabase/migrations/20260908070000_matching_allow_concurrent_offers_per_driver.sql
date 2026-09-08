-- ============================================================================
-- 20260908070000_matching_allow_concurrent_offers_per_driver.sql
-- Multi-ride driver offers, feature 2 of 2, part 1.
--
-- Ridora's correct matching model: a driver may be offered, and see,
-- MULTIPLE eligible rides at once and choose which to accept. The single
-- predicate below (originally in 20260813090300_matching_engine.sql,
-- carried forward unchanged through every later redefinition of this
-- function including the latest, 20260826090000's active-subscription
-- check) currently excludes any driver who already holds another pending,
-- unexpired offer for a DIFFERENT ride -- i.e. it enforces "one driver, one
-- visible offer," which is explicitly NOT the desired product behavior.
--
-- This migration removes only that predicate. Every other eligibility
-- check from 20260826090000 (online, approved, active subscription,
-- correct vehicle type, fresh location, not already assigned to a
-- non-terminal ride, not already offered this specific ride, city match)
-- is preserved verbatim -- none of them enforce driver-side offer
-- exclusivity, so none of them need to change.
--
-- The correct uniqueness invariant -- one ride, one successful driver
-- acceptance -- lives entirely in accept_ride_offer(), hardened in the
-- companion migration 20260908070100_accept_ride_offer_single_active_ride_guard.sql,
-- not here. No table constraint changes: ride_offers' only unique
-- constraint, (ride_id, driver_id, batch_number), was never the blocker
-- and is untouched.
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
    and exists (
      select 1 from public.subscriptions s
      where s.driver_id = d.id and s.status = 'active' and s.expires_at > now()
    )
    and not exists (
      select 1 from public.rides r2
      where r2.driver_id = d.id and r2.status not in ('ride_completed', 'cancelled', 'rated')
    )
    and not exists (
      select 1 from public.ride_offers o
      where o.ride_id = r.id and o.driver_id = d.id
    )
  order by d.current_location <-> r.pickup_location
  limit p_batch_size;
$$;

revoke execute on function public._find_eligible_drivers(uuid, integer) from public;
revoke execute on function public._find_eligible_drivers(uuid, integer) from authenticated;
-- Internal only -- called by dispatch_next_batch(), itself SECURITY
-- DEFINER. CREATE OR REPLACE preserves existing grants on an unchanged
-- signature; the revokes above are kept only to make the intended
-- privilege state explicit at the call site, matching this file's
-- existing convention elsewhere in the migration set.

comment on function public._find_eligible_drivers(uuid, integer) is
  'Eligible-driver spatial query for the next offer batch. Requires: online, approved, matching vehicle type, fresh location, matching city, an active unexpired subscription, not already on another active ride, and not already offered this specific ride. Deliberately does NOT exclude a driver merely for holding a pending offer on a DIFFERENT ride (20260908070000) -- a driver may see multiple eligible rides at once and choose. Server-side one-ride-one-driver exclusivity is enforced entirely in accept_ride_offer(), not here.';
