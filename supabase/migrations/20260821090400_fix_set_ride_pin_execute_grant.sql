-- ============================================================================
-- 20260821090400_fix_set_ride_pin_execute_grant.sql
--
-- Follow-up fix for a regression introduced by 20260821090100, which added
-- `drop function if exists public.set_ride_pin(text);` before its
-- `create or replace function public.set_ride_pin(...)` (required because
-- the function's return type changed from text to void, which Postgres
-- does not allow via CREATE OR REPLACE alone). The DROP discarded the
-- function's prior explicit grants (originally set in
-- 20260815090000_passenger_ride_pins.sql: revoke from public, grant to
-- authenticated), leaving the recreated function on Postgres's default
-- privilege set for functions -- EXECUTE granted to PUBLIC (including
-- anon). Restores the intended grant: authenticated only.
-- ============================================================================

revoke execute on function public.set_ride_pin(text) from public;
grant execute on function public.set_ride_pin(text) to authenticated;
