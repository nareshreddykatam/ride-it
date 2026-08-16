-- ============================================================================
-- 20260813090300_matching_engine.sql
-- Phase 8. The matching engine. All functions SECURITY DEFINER, narrowly
-- scoped, search_path pinned, execute revoked from public and granted only
-- to authenticated (or internal-only, granted to nobody, for helpers only
-- ever called from within another SECURITY DEFINER function).
--
-- Dispatch model: pull-based, not a background cron job. There is no
-- Supabase Edge Function or pg_cron scheduling available to configure in
-- this environment (no live project), so progression is driven by
-- advance_ride_matching() — a lightweight, idempotent "heartbeat" the
-- Passenger app's Matching screen calls on a short interval while
-- searching. This is a deliberate, environment-appropriate design choice,
-- not a compromise hidden as a real scheduler — documented explicitly here
-- and in the Phase 8 review doc.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Config helper — reads app_settings rather than hardcoding values inline.
-- ----------------------------------------------------------------------------
create or replace function public._get_matching_setting_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value)::text::integer from public.app_settings where key = p_key), p_default);
$$;

revoke execute on function public._get_matching_setting_int(text, integer) from public;
revoke execute on function public._get_matching_setting_int(text, integer) from authenticated;
-- Internal only — called by the SECURITY DEFINER functions below, which
-- execute with elevated privilege regardless of grants on this helper.

-- ----------------------------------------------------------------------------
-- Eligible-driver spatial query. Internal only (no client-facing grant).
--
-- Index usage: the `<->` KNN operator (not ST_Distance in ORDER BY) lets
-- Postgres use drivers_online_location_idx (Phase 3's partial GIST index
-- on current_location WHERE is_online AND verification_status='approved')
-- for index-accelerated nearest-neighbor retrieval — this does NOT load
-- every driver into memory and sort in application code; the database
-- does an index-ordered scan and stops at LIMIT.
--
-- Eligibility, all enforced in the WHERE clause (every brief requirement
-- mapped to a specific predicate):
--   online + approved      -> covered by the partial index itself
--   correct vehicle type   -> d.vehicle_type = r.vehicle_type
--   fresh location         -> location_updated_at within the configured
--                             threshold (driver_location_freshness_seconds)
--   not busy               -> no other non-terminal ride assigned to them
--   not already offered    -> no existing ride_offers row for (this ride,
--                             this driver) in any batch — each driver is
--                             only ever offered a given ride once
--   not mid-offer elsewhere -> no other pending, unexpired offer for a
--                             DIFFERENT ride — a driver is never offered
--                             two rides at once
--   correct city            -> ride.city_id is null (unscoped — no city
--                             wired into booking yet, see review doc) OR
--                             driver.current_city_id matches
-- ----------------------------------------------------------------------------
create or replace function public._find_eligible_drivers(p_ride_id uuid, p_batch_size integer)
returns table (driver_id uuid, distance_meters double precision)
language sql
stable
security definer
set search_path = public, extensions
-- FIXED AT SOURCE (not left for the later 090600 correction to patch):
-- a real `supabase db push` against the actual Ride It Supabase project
-- failed here with `function st_distance(extensions.geography,
-- extensions.geography) does not exist` — PostGIS lives in `extensions`
-- (migration 20260803120000), and this function calls ST_Distance()
-- without that schema in its search_path. Phase 8's own review had only
-- reasoned about this risk without a live database to confirm it;
-- 090600_fix_matching_search_path.sql documents that later, independent
-- discovery. Both are now consistent — search_path is correct here from
-- the function's first creation, so the chain applies cleanly in one
-- pass on a fresh project rather than failing then self-correcting three
-- migrations later.
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

revoke execute on function public._find_eligible_drivers(uuid, integer) from public;
revoke execute on function public._find_eligible_drivers(uuid, integer) from authenticated;

-- ----------------------------------------------------------------------------
-- dispatch_next_batch — creates ride_offers for the next wave of eligible
-- drivers, or marks the ride as having no available drivers once
-- matching_max_batches attempts (successful or empty) have been made.
-- Attempts are counted via ride_events, not ride_offers.batch_number,
-- specifically so an EMPTY batch (zero eligible drivers found) still
-- counts toward the limit — otherwise a ride with genuinely zero eligible
-- drivers would retry the same batch number forever and never terminate.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_next_batch(p_ride_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
  v_batch_size integer;
  v_offer_window integer;
  v_max_batches integer;
  v_next_batch integer;
  v_offered_count integer := 0;
  v_driver record;
begin
  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if v_ride.status not in ('requested', 'matched') then
    return 0;
  end if;

  v_batch_size := public._get_matching_setting_int('matching_batch_size', 3);
  v_offer_window := public._get_matching_setting_int('matching_offer_window_seconds', 15);
  v_max_batches := public._get_matching_setting_int('matching_max_batches', 5);

  select count(*) + 1 into v_next_batch
  from public.ride_events
  where ride_id = p_ride_id and event_type in ('batch_dispatched', 'batch_empty');

  if v_next_batch > v_max_batches then
    update public.rides
    set status = 'cancelled', cancelled_by = 'system', cancellation_reason = 'no_drivers_available'
    where id = p_ride_id and status in ('requested', 'matched');

    insert into public.ride_events (ride_id, event_type, actor_type, payload)
    values (p_ride_id, 'matching_exhausted', 'system', jsonb_build_object('batches_attempted', v_next_batch - 1));

    return 0;
  end if;

  for v_driver in select * from public._find_eligible_drivers(p_ride_id, v_batch_size) loop
    insert into public.ride_offers (
      ride_id, driver_id, batch_number, vehicle_type, pickup_address, drop_address,
      distance_km, base_fare, distance_fare, total_fare, currency,
      distance_to_pickup_meters, expires_at
    )
    values (
      p_ride_id, v_driver.driver_id, v_next_batch, v_ride.vehicle_type, v_ride.pickup_address, v_ride.drop_address,
      v_ride.distance_km, v_ride.base_fare, v_ride.distance_fare, v_ride.total_fare, v_ride.currency,
      v_driver.distance_meters, now() + (v_offer_window || ' seconds')::interval
    );
    v_offered_count := v_offered_count + 1;
  end loop;

  if v_offered_count > 0 then
    update public.rides set status = 'matched' where id = p_ride_id and status = 'requested';
    insert into public.ride_events (ride_id, event_type, actor_type, payload)
    values (p_ride_id, 'batch_dispatched', 'system', jsonb_build_object('batch_number', v_next_batch, 'driver_count', v_offered_count));
  else
    insert into public.ride_events (ride_id, event_type, actor_type, payload)
    values (p_ride_id, 'batch_empty', 'system', jsonb_build_object('batch_number', v_next_batch));
  end if;

  return v_offered_count;
end;
$$;

revoke execute on function public.dispatch_next_batch(uuid) from public;
grant execute on function public.dispatch_next_batch(uuid) to authenticated;

comment on function public.dispatch_next_batch(uuid) is
  'Offers the ride to the next batch of nearest eligible drivers, or marks the ride cancelled/no_drivers_available after matching_max_batches attempts. Callable directly, but normally invoked via advance_ride_matching().';

-- ----------------------------------------------------------------------------
-- advance_ride_matching — the heartbeat. Expires stale offers (server
-- time), and dispatches the next batch if no live offer is currently out.
-- Idempotent and safe to call repeatedly/frequently — every statement in
-- it is a conditional UPDATE or a bounded INSERT, not a blind append.
-- ----------------------------------------------------------------------------
create or replace function public.advance_ride_matching(p_ride_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.ride_status_enum;
  v_pending_count integer;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select status into v_status from public.rides where id = p_ride_id;
  if v_status is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if v_status not in ('requested', 'matched') then
    return v_status::text;
  end if;

  update public.ride_offers
  set status = 'expired', responded_at = now()
  where ride_id = p_ride_id and status = 'pending' and expires_at <= now();

  select count(*) into v_pending_count
  from public.ride_offers
  where ride_id = p_ride_id and status = 'pending' and expires_at > now();

  if v_pending_count = 0 then
    perform public.dispatch_next_batch(p_ride_id);
  end if;

  select status into v_status from public.rides where id = p_ride_id;
  return v_status::text;
end;
$$;

revoke execute on function public.advance_ride_matching(uuid) from public;
grant execute on function public.advance_ride_matching(uuid) to authenticated;

comment on function public.advance_ride_matching(uuid) is
  'Pull-based matching heartbeat — expires stale offers and dispatches the next batch if none is currently live. No sensitive ride fields are returned (just the status string), so this is safe to call for any ride_id without an ownership check: it performs internal bookkeeping only, never exposes passenger/fare/address data to the caller.';

-- ----------------------------------------------------------------------------
-- accept_ride_offer — supersedes accept_ride_request() (Phase 6.1). The
-- single atomic UPDATE now also requires an EXISTS check for a valid
-- pending, unexpired offer belonging to the caller, in the SAME WHERE
-- clause — no read-then-write gap between "do I have a valid offer" and
-- "claim the ride." Server time (now()) decides expiry, never client input.
-- ----------------------------------------------------------------------------
create or replace function public.accept_ride_offer(p_ride_id uuid)
returns public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.drivers where id = auth.uid()) then
    raise exception 'Caller is not a registered driver' using errcode = '42501';
  end if;

  update public.rides
  set driver_id = auth.uid(), status = 'accepted', accepted_at = now()
  where id = p_ride_id
    and status = 'matched'
    and driver_id is null
    and exists (
      select 1 from public.ride_offers o
      where o.ride_id = p_ride_id
        and o.driver_id = auth.uid()
        and o.status = 'pending'
        and o.expires_at > now()
    )
  returning * into v_ride;

  if v_ride.id is null then
    -- Lost the race, offer expired, or never existed. If the caller did
    -- have a still-pending row, mark it so their own UI reflects why.
    update public.ride_offers
    set status = case when expires_at > now() then 'superseded' else 'expired' end,
        responded_at = now()
    where ride_id = p_ride_id and driver_id = auth.uid() and status = 'pending';

    return null;
  end if;

  update public.ride_offers
  set status = 'accepted', responded_at = now()
  where ride_id = p_ride_id and driver_id = auth.uid() and status = 'pending';

  -- Every OTHER driver's pending offer for this ride (any batch) is now
  -- moot — mark superseded so their realtime subscription reflects it
  -- immediately rather than waiting for natural expiry.
  update public.ride_offers
  set status = 'superseded', responded_at = now()
  where ride_id = p_ride_id and driver_id != auth.uid() and status = 'pending';

  insert into public.ride_events (ride_id, event_type, actor_type, actor_id, payload)
  values (p_ride_id, 'driver_accepted', 'driver', auth.uid(), '{}'::jsonb);

  return v_ride;
end;
$$;

revoke execute on function public.accept_ride_offer(uuid) from public;
grant execute on function public.accept_ride_offer(uuid) to authenticated;

comment on function public.accept_ride_offer(uuid) is
  'Race-safe ride acceptance, superseding accept_ride_request() (Phase 6.1) — same atomic single-UPDATE pattern, now additionally requiring a valid pending offer for the caller in the same WHERE clause. Returns null (not an error) on a lost race or expired offer.';

-- Superseded — dropped, not left dangling, so there is exactly one
-- acceptance path in the schema.
drop function if exists public.accept_ride_request(uuid);

-- ----------------------------------------------------------------------------
-- reject_ride_offer — explicit driver decline.
-- ----------------------------------------------------------------------------
create or replace function public.reject_ride_offer(p_ride_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  update public.ride_offers
  set status = 'rejected', responded_at = now()
  where ride_id = p_ride_id and driver_id = auth.uid() and status = 'pending';
  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into public.ride_events (ride_id, event_type, actor_type, actor_id, payload)
    values (p_ride_id, 'driver_rejected', 'driver', auth.uid(), '{}'::jsonb);
  end if;
end;
$$;

revoke execute on function public.reject_ride_offer(uuid) from public;
grant execute on function public.reject_ride_offer(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- passenger_cancel_matching_ride — cancellation during requested/matched
-- states. The existing client-side cancelRide() (Phase 5, a plain RLS-gated
-- UPDATE) still works and is unchanged for cancellation after acceptance —
-- this is specifically for the matching phase, where pending ride_offers
-- also need to be superseded atomically so drivers' UIs don't keep
-- showing a request for a ride that no longer exists.
-- ----------------------------------------------------------------------------
create or replace function public.passenger_cancel_matching_ride(p_ride_id uuid, p_reason text default 'Passenger cancelled')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  update public.rides
  set status = 'cancelled', cancelled_by = 'passenger', cancellation_reason = p_reason
  where id = p_ride_id and passenger_id = auth.uid() and status in ('requested', 'matched');
  get diagnostics v_count = row_count;

  if v_count > 0 then
    update public.ride_offers
    set status = 'superseded', responded_at = now()
    where ride_id = p_ride_id and status = 'pending';

    insert into public.ride_events (ride_id, event_type, actor_type, actor_id, payload)
    values (p_ride_id, 'passenger_cancelled_during_matching', 'passenger', auth.uid(), jsonb_build_object('reason', p_reason));
  end if;
end;
$$;

revoke execute on function public.passenger_cancel_matching_ride(uuid, text) from public;
grant execute on function public.passenger_cancel_matching_ride(uuid, text) to authenticated;
