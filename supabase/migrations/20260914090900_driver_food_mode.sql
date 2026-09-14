-- ============================================================================
-- 20260914090900_driver_food_mode.sql
-- Ridora Food Phase 1. The critical cross-vertical business rule: a driver
-- is either in RIDE mode or FOOD mode, never both, enforced server-side.
--
-- work_mode defaults to 'ride' for every row (including all 13 existing
-- production drivers) — this migration is 100% behaviorally inert for any
-- driver who never explicitly switches. The CREATE OR REPLACE on
-- _find_eligible_drivers below adds exactly one predicate
-- (d.work_mode = 'ride') to the existing query — every other predicate,
-- and the function's signature/return shape, are byte-for-byte unchanged
-- from 20260908070000_matching_allow_concurrent_offers_per_driver.sql, so
-- existing ride matching is unaffected for existing drivers.
--
-- Race safety: enforce_driver_work_mode_switch() takes the SAME
-- pg_advisory_xact_lock(hashtext(driver_id)) key that accept_ride_offer
-- (20260908070100) already takes, and accept_food_delivery_offer (next
-- migration) also takes. Whichever transaction acquires the lock first —
-- a driver's own mode-switch UPDATE, a ride acceptance, or a food
-- acceptance — the other blocks until it commits, then re-reads
-- current state. This closes the literal race described in the brief:
-- "driver in FOOD mode, a ride offer and a food offer arrive at the exact
-- same time" can only ever result in one of them succeeding, because
-- accept_ride_offer's own WHERE clause (d.work_mode... see note below)
-- combined with this lock means the loser always re-validates against
-- the post-commit state and fails its own condition.
-- ============================================================================

alter table public.drivers
  add column work_mode public.driver_work_mode_enum not null default 'ride';

comment on column public.drivers.work_mode is 'RIDE or FOOD — mutually exclusive. Defaults to ride for every existing driver. Switching is blocked while the driver holds a non-terminal ride or food delivery assignment — see enforce_driver_work_mode_switch().';

-- ----------------------------------------------------------------------------
-- enforce_driver_work_mode_switch() — blocks a work_mode change while the
-- driver has any non-terminal ride or food delivery assignment. Mirrors
-- enforce_driver_online_requires_subscription's "only checked on the actual
-- transition" scope.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_driver_work_mode_switch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.work_mode is distinct from old.work_mode then
    perform pg_advisory_xact_lock(hashtext(new.id::text)::bigint);

    if exists (
      select 1 from public.rides r
      where r.driver_id = new.id and r.status not in ('ride_completed', 'cancelled', 'rated')
    ) then
      raise exception 'Cannot switch work mode while an active ride is in progress' using errcode = 'P0001';
    end if;

    if exists (
      select 1 from public.food_delivery_assignments a
      where a.driver_id = new.id and a.status in ('accepted', 'picked_up')
    ) then
      raise exception 'Cannot switch work mode while an active food delivery is in progress' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_driver_work_mode_switch on public.drivers;
create trigger enforce_driver_work_mode_switch
  before update on public.drivers
  for each row execute function public.enforce_driver_work_mode_switch();

comment on function public.enforce_driver_work_mode_switch() is
  'Blocks the ride<->food work_mode transition while the driver holds a non-terminal ride or a food_delivery_assignments row in (accepted, picked_up). Takes the same per-driver advisory lock accept_ride_offer/accept_food_delivery_offer take, so a mode switch racing an offer acceptance can never leave the driver in both states.';

-- ----------------------------------------------------------------------------
-- set_driver_work_mode(p_work_mode) — the only client-facing entry point
-- for changing work_mode (rather than a raw UPDATE via RLS), so the
-- Driver app has one clear call and one clear error to handle. is_online is
-- left untouched: switching modes while online keeps the driver online in
-- the new mode; switching while offline is always allowed (no active-work
-- conflict is possible offline).
-- ----------------------------------------------------------------------------
create or replace function public.set_driver_work_mode(p_work_mode public.driver_work_mode_enum)
returns public.drivers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver public.drivers;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  update public.drivers
  set work_mode = p_work_mode
  where id = auth.uid()
  returning * into v_driver;

  if v_driver.id is null then
    raise exception 'Caller is not a registered driver' using errcode = '42501';
  end if;

  return v_driver;
end;
$$;

revoke all on function public.set_driver_work_mode(public.driver_work_mode_enum) from public;
grant execute on function public.set_driver_work_mode(public.driver_work_mode_enum) to authenticated;

-- ----------------------------------------------------------------------------
-- _find_eligible_drivers — CREATE OR REPLACE, additive filter only. Based
-- on the ACTUAL latest production body (20260910140000_phase1_audit_
-- payment_matching_and_idor_fixes.sql section 9 — the vehicle-type-matched
-- subscription check from AUDIT-008 and the "exclude non-superseded offers
-- only" logic from AUDIT-011), not the earlier 20260908070000 snapshot —
-- verified against the actual current migration file before writing this,
-- specifically to avoid silently reverting either fix. The single new
-- predicate added here is "and d.work_mode = 'ride'"; everything else is
-- byte-for-byte the current production body. Signature/return shape
-- unchanged, so dispatch_next_batch and every caller continues to work.
-- ----------------------------------------------------------------------------
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
   and d.work_mode = 'ride'
   and d.current_location is not null
   and d.location_updated_at is not null
   and d.location_updated_at > now() - (public._get_matching_setting_int('driver_location_freshness_seconds', 120) || ' seconds')::interval
   and (r.city_id is null or d.current_city_id = r.city_id)
  where r.id = p_ride_id
    and exists (
      select 1 from public.subscriptions s
      where s.driver_id = d.id
        and s.status = 'active'
        and s.expires_at > now()
        and s.vehicle_type = d.vehicle_type
    )
    and not exists (
      select 1 from public.rides r2
      where r2.driver_id = d.id and r2.status not in ('ride_completed', 'cancelled', 'rated')
    )
    and not exists (
      select 1 from public.ride_offers o
      where o.ride_id = r.id
        and o.driver_id = d.id
        and o.status <> 'superseded'
    )
  order by d.current_location <-> r.pickup_location
  limit p_batch_size;
$$;

revoke execute on function public._find_eligible_drivers(uuid, integer) from public;
revoke execute on function public._find_eligible_drivers(uuid, integer) from authenticated;

comment on function public._find_eligible_drivers(uuid, integer) is
  '20260914: added "and d.work_mode = ''ride''" on top of the AUDIT-008/AUDIT-011 body (vehicle-type-matched subscription check; only non-superseded offers exclude a driver) — every other predicate unchanged. A driver in FOOD mode is now structurally invisible to ride matching, the mirror image of _find_eligible_food_drivers requiring work_mode=''food''.';

-- ----------------------------------------------------------------------------
-- accept_ride_offer — CREATE OR REPLACE, adding a work_mode check to the
-- existing atomic UPDATE's WHERE clause (via the driver join) so that even
-- if a stale offer somehow exists for a driver who has since switched to
-- FOOD mode, acceptance still fails atomically rather than relying on
-- _find_eligible_drivers having filtered them out earlier. Every other
-- line is unchanged from 20260908070100_accept_ride_offer_single_active_
-- ride_guard.sql.
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

  if not exists (select 1 from public.drivers where id = auth.uid() and work_mode = 'ride') then
    raise exception 'Caller is not a registered driver in Ride mode' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text)::bigint);

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
    and not exists (select 1 from public.drivers d where d.id = auth.uid() and d.work_mode != 'ride')
    and not exists (
      select 1 from public.rides r2
      where r2.driver_id = auth.uid() and r2.status not in ('ride_completed', 'cancelled', 'rated')
    )
  returning * into v_ride;

  if v_ride.id is null then
    update public.ride_offers
    set status = case when expires_at > now() then 'superseded' else 'expired' end,
        responded_at = now()
    where ride_id = p_ride_id and driver_id = auth.uid() and status = 'pending';

    return null;
  end if;

  update public.ride_offers
  set status = 'accepted', responded_at = now()
  where ride_id = p_ride_id and driver_id = auth.uid() and status = 'pending';

  update public.ride_offers
  set status = 'superseded', responded_at = now()
  where ride_id = p_ride_id and driver_id != auth.uid() and status = 'pending';

  insert into public.ride_events (ride_id, event_type, actor_type, actor_id, payload)
  values (p_ride_id, 'driver_accepted', 'driver', auth.uid(), '{}'::jsonb);

  perform public._create_notification(
    v_ride.passenger_id,
    'ride_status',
    'Driver assigned',
    'Your driver is on the way.',
    jsonb_build_object('ride_id', v_ride.id, 'driver_id', auth.uid())
  );

  return v_ride;
end;
$$;

revoke execute on function public.accept_ride_offer(uuid) from public;
grant execute on function public.accept_ride_offer(uuid) to authenticated;

comment on function public.accept_ride_offer(uuid) is
  '20260914: added an advisory lock on the caller''s own driver id (the SAME lock key enforce_driver_work_mode_switch/accept_food_delivery_offer use) plus a work_mode=ride re-check inside the same atomic UPDATE, so a driver cannot accept a ride while in FOOD mode even under a concurrent mode-switch or food-offer-acceptance race. Every other predicate/behavior (including the 20260908070100 same-driver double-accept guard and the passenger notification) is unchanged.';
