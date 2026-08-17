-- ============================================================================
-- 20260826090000_matching_requires_active_subscription.sql
-- Production-readiness pass: closes a real eligibility gap in the
-- matching engine.
--
-- Bug: enforce_driver_online_requires_subscription() (20260807090100) only
-- checks the false->true transition of drivers.is_online — by its own
-- documented design ("you can't switch ON without a subscription, not you
-- must continuously hold one every second"). That's the right call for
-- is_online itself (a driver mid-shift shouldn't be silently forced
-- offline the instant a subscription clock ticks over), but
-- _find_eligible_drivers() (20260813090300_matching_engine.sql) trusted
-- `is_online = true` as a full proxy for "eligible to receive new
-- offers" and never re-checked subscription status at match time. Net
-- effect: a driver who goes online while subscribed, then never manually
-- goes offline, keeps receiving new ride offers indefinitely after their
-- subscription expires — directly undermining the platform's only
-- revenue mechanism (flat subscription, no per-ride commission).
--
-- Fix: add the same active/unexpired subscription predicate the online
-- trigger already uses (status = 'active' and expires_at > now()) as an
-- additional filter on NEW offers only. This does not touch is_online
-- itself, does not retroactively kick anyone off an in-progress ride, and
-- does not change the online-toggle trigger's existing (correct)
-- behavior — it only stops a lapsed driver from being selected for the
-- *next* batch of offers. Index-accelerated via the existing
-- subscriptions_active_driver_idx partial index (driver_id) where
-- status = 'active' and deleted_at is null, from 20260803120600.
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
    and not exists (
      select 1 from public.ride_offers o2
      where o2.driver_id = d.id and o2.status = 'pending' and o2.expires_at > now()
    )
  order by d.current_location <-> r.pickup_location
  limit p_batch_size;
$$;

revoke execute on function public._find_eligible_drivers(uuid, integer) from public;
revoke execute on function public._find_eligible_drivers(uuid, integer) from authenticated;
-- Internal only — called by dispatch_next_batch(), itself SECURITY
-- DEFINER, same as the original definition. CREATE OR REPLACE preserves
-- existing grants on an unchanged signature; the revokes above are kept
-- only to make the intended privilege state explicit at the call site,
-- matching this file's existing convention elsewhere in the migration set.

comment on function public._find_eligible_drivers(uuid, integer) is
  'Eligible-driver spatial query for the next offer batch. Requires: online, approved, matching vehicle type, fresh location, matching city, an active unexpired subscription, not already on another active ride, and not already offered/holding a pending offer. Added the active-subscription check in 20260826090000 — a lapsed subscription no longer silently continues to receive offers just because is_online was never toggled off.';
