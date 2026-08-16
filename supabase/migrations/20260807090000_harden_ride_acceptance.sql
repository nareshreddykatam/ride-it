-- ============================================================================
-- 20260807090000_harden_ride_acceptance.sql
-- Phase 6.1 security hardening, item 1.
--
-- Vulnerability: rides_accept_unassigned_by_driver (Phase 6) let any
-- authenticated driver claim ANY unassigned requested ride via a direct
-- client UPDATE, regardless of vehicle_type. The client-side
-- getNextAvailableRideRequest() filter is not a security boundary — anyone
-- could call `supabase.from('rides').update(...)` directly and claim a
-- Bike ride with an Auto (or vice versa).
--
-- Fix: a single atomic RPC that folds the vehicle_type check into the same
-- conditional UPDATE that already made acceptance race-safe, and DROPS the
-- old policy so direct client updates can no longer claim a ride at all —
-- acceptance is now only possible through this function.
-- ============================================================================

drop policy if exists "rides_accept_unassigned_by_driver" on public.rides;

create or replace function public.accept_ride_request(p_ride_id uuid)
returns public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
  v_driver_vehicle_type public.vehicle_type_enum;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select vehicle_type into v_driver_vehicle_type
  from public.drivers
  where id = auth.uid();

  if v_driver_vehicle_type is null then
    raise exception 'Caller is not a registered driver' using errcode = '42501';
  end if;

  -- Single atomic UPDATE: race-safety (status/driver_id conditions, as
  -- before) AND the vehicle-type match are both enforced in the same WHERE
  -- clause, so there is no window between "check vehicle type" and "claim
  -- the ride" for another request to slip in.
  update public.rides
  set driver_id = auth.uid(), status = 'accepted', accepted_at = now()
  where id = p_ride_id
    and status = 'requested'
    and driver_id is null
    and vehicle_type = v_driver_vehicle_type
  returning * into v_ride;

  -- Null (not an error) if the ride was already taken, doesn't exist, or
  -- didn't match this driver's vehicle type — all three are ordinary
  -- "you didn't get this one" outcomes, not exceptional ones.
  return v_ride;
end;
$$;

comment on function public.accept_ride_request(uuid) is
  'Atomically claims an unassigned ride for the calling driver, enforcing status/driver_id race-safety AND vehicle_type match server-side in one UPDATE. This is now the ONLY way to claim a ride — the permissive rides_accept_unassigned_by_driver policy was dropped.';

revoke execute on function public.accept_ride_request(uuid) from public;
grant execute on function public.accept_ride_request(uuid) to authenticated;
