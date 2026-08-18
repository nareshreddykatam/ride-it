-- ============================================================================
-- 20260827090100_matched_driver_contact_add_plate.sql
--
-- Extends get_matched_driver_contact() (previous migration) with the
-- matched driver's active vehicle's registration number. Same gap as
-- phone/name: public.vehicles only has vehicles_select_own (driver) and
-- vehicles_all_admin — a passenger has no RLS path to their matched
-- driver's plate number either, so the Active Ride screen's plate field
-- has been rendering blank. Folded into the same function (not a third
-- RPC) since it's the same authorization check and the same screen reads
-- both at once.
--
-- CREATE OR REPLACE cannot change a function's return table shape, so the
-- old signature is dropped first — safe, since nothing has been wired to
-- call the two-column version yet.
-- ============================================================================

drop function if exists public.get_matched_driver_contact(uuid);

create or replace function public.get_matched_driver_contact(p_ride_id uuid)
returns table(full_name text, phone text, plate_number text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.full_name, u.phone, v.registration_number
  from public.rides r
  join public.users u on u.id = r.driver_id
  left join public.vehicles v on v.driver_id = r.driver_id and v.is_active = true and v.deleted_at is null
  where r.id = p_ride_id
    and r.passenger_id = auth.uid()
    and r.driver_id is not null
    and r.status not in ('ride_completed', 'cancelled', 'rated');
end;
$$;

revoke all on function public.get_matched_driver_contact(uuid) from public;
grant execute on function public.get_matched_driver_contact(uuid) to authenticated;

comment on function public.get_matched_driver_contact(uuid) is
  'Returns the matched driver''s name/phone/active-vehicle-plate for the calling passenger''s own active ride, or zero rows otherwise. The one narrow, audited carve-out onto public.users and public.vehicles for another user''s row — there is no general passenger-readable policy on either table. Scoped with the same predicate as drivers_select_active_ride_passenger.';
