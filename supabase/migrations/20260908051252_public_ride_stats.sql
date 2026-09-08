-- ============================================================================
-- 20260908051252_public_ride_stats.sql
-- Public, unauthenticated "successful rides" counter for the Marketing
-- homepage (ridora.in). This is the SECOND deliberate, narrow exception to
-- this project's "no anon access, ever" posture -- the first and, until
-- now, only one is get_shared_ride_info() (20260818090300_ride_shares.sql).
-- Same discipline applies here: the function returns the absolute minimum
-- (one integer, never ride/passenger/driver/fare/timestamp data), is
-- SECURITY DEFINER + STABLE, and is the only way an anon caller can ever
-- reach an aggregate over rides -- RLS on rides itself is untouched and
-- still blocks every row-level anon read.
-- ============================================================================

create index rides_completed_at_idx on public.rides (completed_at) where completed_at is not null;
comment on index rides_completed_at_idx is 'Backs get_public_ride_stats()''s COUNT(*) WHERE completed_at IS NOT NULL with a narrow partial index instead of a full-table scan for a query the public homepage runs on every visit.';

create or replace function public.get_public_ride_stats()
returns table (successful_rides integer)
language sql
security definer
stable
set search_path = public
as $$
  -- completed_at IS NOT NULL is the same authoritative "did this ride
  -- actually finish" signal admin_klu_pilot_summary's completed_rides_total
  -- already uses (20260830090000_admin_command_center_analytics.sql) --
  -- set exactly once, at the ride_completed transition, and never cleared
  -- again (including on any later cancellation, which is a distinct
  -- status value with completed_at left null). A ride that has since moved
  -- to 'payment' or 'rated' is still counted -- those are later stages of
  -- the same completed ride, not separate success/failure outcomes.
  select count(*)::integer from public.rides where completed_at is not null;
$$;

revoke all on function public.get_public_ride_stats() from public;
grant execute on function public.get_public_ride_stats() to anon;
grant execute on function public.get_public_ride_stats() to authenticated;

comment on function public.get_public_ride_stats() is 'The SECOND anon-granted function in this project -- see get_shared_ride_info() for the first, and its migration header for the "no anon access, ever" posture this is a deliberate, narrow exception to. Returns ONLY a single aggregate integer -- no ride, passenger, driver, fare, or timestamp data of any kind is ever exposed. Backs the public Marketing homepage''s "successful rides" counter.';
