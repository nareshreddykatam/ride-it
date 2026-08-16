-- ============================================================================
-- 20260806090200_increment_driver_strike_function.sql
-- Small RPC function so driver-cancellation strike increments are atomic
-- (`strike_count = strike_count + 1` server-side) rather than a client-side
-- read-then-write, which would race under concurrent cancellations.
-- SECURITY DEFINER + explicit driver_id match keeps this narrowly scoped —
-- it can only increment the caller's own strike count, not anyone else's.
-- ============================================================================

create or replace function public.increment_driver_strike(p_driver_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.drivers
  set strike_count = strike_count + 1
  where id = p_driver_id and id = auth.uid();
$$;

comment on function public.increment_driver_strike(uuid) is
  'Atomically increments the calling driver''s own strike_count by 1. Used by cancelRideByDriver() in @ride-it/data on driver-initiated post-acceptance cancellation.';

grant execute on function public.increment_driver_strike(uuid) to authenticated;
