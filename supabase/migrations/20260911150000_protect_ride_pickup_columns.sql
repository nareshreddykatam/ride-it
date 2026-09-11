-- 20260911150000_protect_ride_pickup_columns.sql
-- Ridora Phase 1 — passenger map-based pickup editing.
--
-- The new "Edit pickup" flow (booking/map-select, booking/confirm's
-- Edit-pickup sheet) only ever calls createRide() with the chosen
-- pickup_location/pickup_address — it never issues an UPDATE. Pickup can
-- only be edited before a ride exists at all (see resolveLocations() /
-- handleConfirmBooking() in apps/passenger/app/booking/confirm/page.tsx),
-- which is exactly the "before the ride is requested" lifecycle rule this
-- phase requires.
--
-- That rule was UI-only, not enforced by the database. rides_update_passenger
-- (20260817090000) grants row-level UPDATE on a passenger's own ride through
-- 'driver_arriving' — i.e. even after a driver has accepted — and, unlike
-- driver_id/status/the Ride PIN counters (locked down by
-- protect_ride_assignment_columns, AUDIT-002/AUDIT-012), pickup_location and
-- pickup_address had no column-level guard at all. A direct PATCH
-- /rest/v1/rides?id=eq.<own ride> with a new pickup_location would have been
-- accepted by RLS on any ride still in ('requested', 'matched', 'accepted',
-- 'driver_arriving') — silently relocating pickup out from under a driver
-- already en route, with no honest rejection for the client to show.
--
-- Fix: mirror protect_ride_assignment_columns' shape exactly (same
-- current_user/is_admin admission — SECURITY INVOKER so a genuine trusted
-- write, which always runs as a SECURITY DEFINER function's owner, is
-- unaffected). No legitimate path ever updates these two columns post-insert
-- (grepped across packages/data — only the original INSERT in createRide()
-- touches them), so this blocks the change unconditionally rather than
-- gating it on ride status: there is no ride status at which a direct client
-- UPDATE to pickup should ever succeed.
create or replace function public.protect_ride_pickup_columns()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.pickup_location is distinct from old.pickup_location
     or new.pickup_address is distinct from old.pickup_address then
    raise exception
      'Pickup location cannot be changed after a ride has been requested'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_ride_pickup_columns on public.rides;
create trigger protect_ride_pickup_columns
  before update on public.rides
  for each row execute function public.protect_ride_pickup_columns();

comment on function public.protect_ride_pickup_columns() is
  'Blocks direct passenger/driver modification of pickup_location/pickup_address on an existing ride — pickup is only ever set once, at createRide()''s own INSERT. Closes the gap where rides_update_passenger''s broad row-level RLS would otherwise let a passenger relocate pickup via a direct client UPDATE even after a driver has accepted, which the Phase 1 map-pickup-edit feature''s UI-only restriction (Edit pickup only appears before the ride is created) never actually enforced at the data layer.';
