-- ============================================================================
-- 20260827090000_matched_driver_contact_access.sql
--
-- Closes a real gap found while wiring the passenger Active Ride screen's
-- driver-identity card: that screen's code already renders driver.full_name
-- and a tel:${driver.phone} link, but there is no RLS policy letting a
-- passenger read another user's row in public.users at all — the existing
-- getDriverProfile() embed (drivers -> users!drivers_id_fkey) silently
-- comes back with full_name/phone as null for a passenger caller. The
-- feature was UI-complete but never actually functional.
--
-- Deliberately NOT fixed by adding a general passenger-readable policy on
-- public.users (a driver's phone number is personal data, and a blanket
-- policy would let any authenticated passenger look up any driver's phone
-- by id). Instead, two narrow SECURITY DEFINER functions, scoped to
-- exactly "this passenger's own currently-active ride with this driver" —
-- reusing the identical predicate as the existing
-- drivers_select_active_ride_passenger policy (0006_row_level_security.sql)
-- for consistency, rather than inventing a different status list.
--
-- get_matched_driver_selfie_path() intentionally returns only a Storage
-- *path*, never a URL — minting a signed URL requires the Storage API, not
-- SQL, so the passenger Route Handler that calls this function is the one
-- that turns the path into a short-lived signed URL server-side. See
-- apps/passenger/app/api/rides/[id]/driver-selfie/route.ts.
-- ============================================================================

create or replace function public.get_matched_driver_contact(p_ride_id uuid)
returns table(full_name text, phone text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.full_name, u.phone
  from public.rides r
  join public.users u on u.id = r.driver_id
  where r.id = p_ride_id
    and r.passenger_id = auth.uid()
    and r.driver_id is not null
    and r.status not in ('ride_completed', 'cancelled', 'rated');
end;
$$;

revoke all on function public.get_matched_driver_contact(uuid) from public;
grant execute on function public.get_matched_driver_contact(uuid) to authenticated;

comment on function public.get_matched_driver_contact(uuid) is
  'Returns the matched driver''s name/phone for the calling passenger''s own active ride, or zero rows otherwise. The one narrow, audited carve-out onto public.users for another user''s row — there is no general passenger-readable policy on that table. Scoped with the same predicate as drivers_select_active_ride_passenger.';

create or replace function public.get_matched_driver_selfie_path(p_ride_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin
  select dd.file_path into v_path
  from public.rides r
  join public.driver_documents dd on dd.driver_id = r.driver_id
  where r.id = p_ride_id
    and r.passenger_id = auth.uid()
    and r.driver_id is not null
    and r.status not in ('ride_completed', 'cancelled', 'rated')
    and dd.document_type = 'selfie'
    and dd.status = 'approved'
    and dd.deleted_at is null
  order by dd.reviewed_at desc nulls last
  limit 1;

  return v_path;
end;
$$;

revoke all on function public.get_matched_driver_selfie_path(uuid) from public;
grant execute on function public.get_matched_driver_selfie_path(uuid) to authenticated;

comment on function public.get_matched_driver_selfie_path(uuid) is
  'Returns the Storage object path (not a URL) of the matched driver''s approved selfie, for the calling passenger''s own active ride only, or null. Callers must mint a short-lived signed URL server-side (service-role client) from this path — never return this path itself to any client, and never accept a client-supplied path/driver id in its place.';
