-- ============================================================================
-- 20260829090100_matched_passenger_contact_access.sql
--
-- The driver-side mirror of get_matched_driver_contact()
-- (20260827090000/20260827090100): the Driver app's active-ride screen has
-- no RLS path to read a matched passenger's name/phone at all (same gap
-- pattern — passengers_select_active_ride_driver only exposes
-- public.passengers, and phone/full_name live on public.users, which has
-- no driver-readable policy for another user's row). "Call Passenger" /
-- "Message Passenger" have had nothing to call.
--
-- Same narrow-carve-out shape as the passenger-side function: one
-- SECURITY DEFINER function scoped to exactly "this driver's own
-- currently-assigned, non-terminal ride", not a general driver-readable
-- policy on public.users.
-- ============================================================================

create or replace function public.get_matched_passenger_contact(p_ride_id uuid)
returns table(full_name text, phone text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.full_name, u.phone
  from public.rides r
  join public.users u on u.id = r.passenger_id
  where r.id = p_ride_id
    and r.driver_id = auth.uid()
    and r.status not in ('ride_completed', 'cancelled', 'rated');
end;
$$;

revoke all on function public.get_matched_passenger_contact(uuid) from public;
grant execute on function public.get_matched_passenger_contact(uuid) to authenticated;

comment on function public.get_matched_passenger_contact(uuid) is
  'Returns the matched passenger''s name/phone for the calling driver''s own currently-assigned, non-terminal ride, or zero rows otherwise. The driver-side mirror of get_matched_driver_contact() — the one narrow, audited carve-out onto public.users for another user''s row in this direction. Scoped with the same predicate as passengers_select_active_ride_driver.';
