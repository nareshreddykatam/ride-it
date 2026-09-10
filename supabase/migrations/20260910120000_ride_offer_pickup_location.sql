-- ============================================================================
-- 20260910120000_ride_offer_pickup_location.sql
-- Feature: driver pickup-distance/ETA on ride offer cards, before acceptance.
--
-- ride_offers already carries a real, PostGIS-computed
-- distance_to_pickup_meters (frozen at dispatch time, see
-- dispatch_next_batch()/_find_eligible_drivers() in
-- 20260813090300_matching_engine.sql) and pickup_address (text) -- but no
-- coordinate, so the driver client has no way to call the already-built
-- Routes-API-backed /api/eta (packages/maps/src/server/eta.ts,
-- apps/driver/app/api/eta/route.ts -- both exist today but are unused by
-- any driver UI) for a real pickup ETA. A driver has no RLS access to
-- rides.pickup_location directly for a ride not yet assigned to them
-- (rides_select_driver only permits already-assigned rides -- see
-- 20260813090000_ride_offers.sql's own header comment for the original
-- reasoning that led to denormalizing pickup_address onto ride_offers in
-- the first place).
--
-- This mirrors get_ride_tracking()'s already-established pattern
-- (20260814090000_ride_tracking.sql): decode a geography column
-- server-side into plain doubles, with an explicit authorization check,
-- rather than ever exposing the raw geography column to PostgREST (which
-- would otherwise serialize it as unusable WKB hex).
--
-- Deliberately scoped to the driver's OWN ride_offers row, via the same
-- boundary as the existing "ride_offers_select_own_driver" RLS policy
-- (driver_id = auth.uid()), regardless of the offer's current status -- a
-- driver who already has RLS access to this offer's pickup_address text
-- gains no new privacy exposure from also seeing the exact coordinate of
-- that same already-visible point. Returns zero rows (not an exception)
-- when the offer doesn't exist or doesn't belong to the caller, since this
-- is only ever called for an offer id the driver already has loaded
-- client-side -- no ownership-probing concern to guard against with a
-- raised error instead.
-- ============================================================================

create or replace function public.get_ride_offer_pickup_location(p_offer_id uuid)
returns table (
  pickup_lat double precision,
  pickup_lng double precision
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  return query
  select
    ST_Y(r.pickup_location::geometry)::double precision,
    ST_X(r.pickup_location::geometry)::double precision
  from public.ride_offers o
  join public.rides r on r.id = o.ride_id
  where o.id = p_offer_id
    and o.driver_id = auth.uid();
end;
$$;

comment on function public.get_ride_offer_pickup_location(uuid) is
  'Decodes a ride offer''s pickup point into plain lat/lng, scoped to the offer''s own driver only -- the sanctioned way to get real pickup coordinates for pre-acceptance ETA/distance display via the existing Routes API integration (see @ride-it/maps/server/eta.ts). Returns zero rows if the offer does not exist or does not belong to the caller.';

revoke execute on function public.get_ride_offer_pickup_location(uuid) from public;
grant execute on function public.get_ride_offer_pickup_location(uuid) to authenticated;
