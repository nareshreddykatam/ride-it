-- ============================================================================
-- 20260908060000_driver_speed_telemetry.sql
-- Live driver speedometer, feature 1 of 2. Adds speed_kmh/speed_updated_at
-- to drivers (piggybacking on the existing drivers-row realtime publication
-- from 20260814090000_ride_tracking.sql, so the passenger's existing
-- subscribeToDriverLocationChanges() subscription picks up a speed-only
-- write for free -- no new realtime channel needed).
--
-- Deliberately NOT a plain client .update() + RLS policy: unlike
-- current_location (drivers_update_own -- a simple self-row check), a
-- speed publish must also be gated on "there's an active ride assigned to
-- this driver right now," which is a join to rides that RLS on drivers
-- cannot cheaply express per-write. update_driver_speed() follows this
-- codebase's established RPC-only-mutation convention for exactly that
-- reason (see accept_ride_offer, complete_ride, verify_ride_pin_and_start).
-- ============================================================================

alter table public.drivers
  add column speed_kmh numeric(5, 2),
  add column speed_updated_at timestamptz;

comment on column public.drivers.speed_kmh is
  'Driver''s most recently published live speed in km/h. Only meaningful while speed_updated_at is fresh AND the driver has a ride in an active status -- callers should prefer get_ride_tracking()''s ride-scoped speed fields, which already apply that guard, over reading this column directly. Never written by the client directly -- see update_driver_speed().';

comment on column public.drivers.speed_updated_at is
  'Server-set timestamp (now() inside update_driver_speed()) of the last accepted speed publish for this driver. Never client-supplied.';

-- ----------------------------------------------------------------------------
-- update_driver_speed -- publishes the calling driver's live speed for a
-- specific ride. Validates, in one WHERE-guarded UPDATE (no read-then-write
-- gap): caller is authenticated, caller is a registered driver, and the
-- given ride is currently assigned to this driver AND in an active-ride
-- status. Returns false (never raises) when that guard fails -- a benign,
-- expected race as a ride completes mid-publish, or a stale client still
-- ticking after navigating away. Raises only for a malformed call:
-- unauthenticated, non-driver caller, or an out-of-range speed value --
-- same "legitimate race vs. caller error" distinction accept_ride_offer()
-- already draws.
-- ----------------------------------------------------------------------------
create or replace function public.update_driver_speed(p_ride_id uuid, p_speed_kmh numeric)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.drivers where id = auth.uid()) then
    raise exception 'Caller is not a registered driver' using errcode = '42501';
  end if;

  if p_speed_kmh is null or p_speed_kmh < 0 or p_speed_kmh > 200 then
    raise exception 'Speed out of plausible range' using errcode = '22003';
  end if;

  update public.drivers d
  set speed_kmh = p_speed_kmh,
      speed_updated_at = now()
  where d.id = auth.uid()
    and exists (
      select 1 from public.rides r
      where r.id = p_ride_id
        and r.driver_id = auth.uid()
        and r.status in ('ride_started', 'destination_reached', 'payment_collected')
    );
  get diagnostics v_updated = row_count;

  return v_updated > 0;
end;
$$;

revoke execute on function public.update_driver_speed(uuid, numeric) from public;
grant execute on function public.update_driver_speed(uuid, numeric) to authenticated;

comment on function public.update_driver_speed(uuid, numeric) is
  'Publishes the calling driver''s live speed (km/h) for a specific ride. Returns false (never raises) if the ride is not currently assigned to this driver or not in an active-ride status (ride_started/destination_reached/payment_collected) -- a benign, expected race. Raises only for a malformed call: unauthenticated, non-driver caller, or a speed value outside [0, 200].';
