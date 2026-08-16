-- ============================================================================
-- 20260819090400_ride_participant_name.sql
-- Phase 15. REAL GAP FOUND while building the rating screens: both
-- drivers_select_active_ride_passenger AND passengers_select_active_ride_driver
-- (Phase 3) explicitly exclude 'ride_completed', 'cancelled', 'rated' from
-- their visibility window — a deliberate, correct privacy boundary for
-- the FULL profile (rating, total_rides, vehicle info, live location,
-- etc.), but it also means neither party can see the other's NAME at
-- exactly the moment the rating UI needs to show "Rate your trip with
-- <name>" — the ride is, by definition, already in one of those excluded
-- statuses by then.
--
-- Fixed with a narrow RPC returning ONLY a name — not by widening either
-- existing policy. Widening was considered and rejected: 'rated' is
-- often the ride's permanent resting status, so including it in either
-- policy's visible-status set would leave FULL profile access (phone/
-- rating/etc. — whatever those tables expose) open indefinitely after
-- any rated ride, reopening the exact exposure those policies exist to
-- prevent. A name is not sensitive in the way the rest of that profile
-- is (both parties already know who they shared a ride with), so a
-- purpose-built function is the correct scope, not a broader carve-out.
-- ============================================================================

create or replace function public.get_ride_participant_name(p_ride_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
  v_other_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then
    return null;
  end if;

  if v_ride.passenger_id = auth.uid() then
    v_other_id := v_ride.driver_id;
  elsif v_ride.driver_id = auth.uid() then
    v_other_id := v_ride.passenger_id;
  else
    raise exception 'Caller did not participate in this ride' using errcode = '42501';
  end if;

  if v_other_id is null then
    return null;
  end if;

  return (select full_name from public.users where id = v_other_id);
end;
$$;

revoke execute on function public.get_ride_participant_name(uuid) from public;
grant execute on function public.get_ride_participant_name(uuid) to authenticated;

comment on function public.get_ride_participant_name(uuid) is 'Returns ONLY the other participant''s name for a ride the caller was genuinely part of, at any ride status — deliberately narrower than the broader drivers_select_active_ride_passenger/passengers_select_active_ride_driver policies (Phase 3), which correctly stop exposing the full profile once a ride ends. Built for the Phase 15 rating screens.';
