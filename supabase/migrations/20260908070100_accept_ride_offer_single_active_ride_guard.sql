-- ============================================================================
-- 20260908070100_accept_ride_offer_single_active_ride_guard.sql
-- Multi-ride driver offers, feature 2 of 2, part 2.
--
-- Real correctness gap opened by 20260908070000: once a driver can hold
-- more than one pending offer at a time, accept_ride_offer()'s existing
-- WHERE clause (status='matched' AND driver_id IS NULL AND EXISTS(pending
-- offer for this driver)) never checked whether the CALLING DRIVER already
-- has a different non-terminal ride assigned -- because before this
-- change that situation could never arise. A driver holding two
-- simultaneous pending offers (ride A, ride B) could otherwise accept
-- both: first A, then B, since accepting A never touches ride B's row.
--
-- A plain `NOT EXISTS (rides WHERE driver_id = auth.uid() AND status NOT
-- IN (terminal))` check bolted onto the WHERE clause is NOT enough to
-- close this under Postgres's default READ COMMITTED isolation: two
-- concurrent accept_ride_offer() calls for two DIFFERENT rides (A and B)
-- target two different `rides` rows, so the row-level UPDATE lock on
-- `rides.id = p_ride_id` does not serialize them against each other --
-- both transactions could evaluate the NOT EXISTS check before either
-- commits, and both could succeed.
--
-- Fix: pg_advisory_xact_lock(hashtext(auth.uid()::text)::bigint), taken
-- before the check, serializes concurrent accept attempts BY THE SAME
-- DRIVER regardless of which ride they target -- the second call blocks
-- until the first's transaction ends, then correctly sees the
-- newly-committed assignment and fails cleanly. This is additive to, not
-- a replacement for, the pre-existing single-row UPDATE lock on
-- `rides.id = p_ride_id`, which already correctly serializes two
-- DIFFERENT drivers racing to accept the SAME ride -- that behavior is
-- unchanged by this migration.
--
-- v_ride.id IS NULL still means "no ride, try again" to the caller in
-- every losing case (lost race for this ride / offer expired / driver
-- already busy with a different ride) -- same existing convention, not
-- distinguished to the client, and the caller's own offer for this
-- specific ride is still marked accordingly either way.
-- ============================================================================

create or replace function public.accept_ride_offer(p_ride_id uuid)
returns public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.drivers where id = auth.uid()) then
    raise exception 'Caller is not a registered driver' using errcode = '42501';
  end if;

  -- Serializes concurrent accept attempts BY THE SAME DRIVER across
  -- different rides -- see migration header comment for why the WHERE
  -- clause's NOT EXISTS check alone is insufficient under READ COMMITTED.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text)::bigint);

  update public.rides
  set driver_id = auth.uid(), status = 'accepted', accepted_at = now()
  where id = p_ride_id
    and status = 'matched'
    and driver_id is null
    and exists (
      select 1 from public.ride_offers o
      where o.ride_id = p_ride_id
        and o.driver_id = auth.uid()
        and o.status = 'pending'
        and o.expires_at > now()
    )
    and not exists (
      select 1 from public.rides r2
      where r2.driver_id = auth.uid()
        and r2.status not in ('ride_completed', 'cancelled', 'rated')
    )
  returning * into v_ride;

  if v_ride.id is null then
    -- Lost the race, offer expired, driver already busy with another
    -- ride, or never existed. If the caller did have a still-pending row
    -- for THIS ride, mark it so their own UI reflects why.
    update public.ride_offers
    set status = case when expires_at > now() then 'superseded' else 'expired' end,
        responded_at = now()
    where ride_id = p_ride_id and driver_id = auth.uid() and status = 'pending';

    return null;
  end if;

  update public.ride_offers
  set status = 'accepted', responded_at = now()
  where ride_id = p_ride_id and driver_id = auth.uid() and status = 'pending';

  -- Every OTHER driver's pending offer for this ride (any batch) is now
  -- moot -- mark superseded so their realtime subscription reflects it
  -- immediately rather than waiting for natural expiry.
  update public.ride_offers
  set status = 'superseded', responded_at = now()
  where ride_id = p_ride_id and driver_id != auth.uid() and status = 'pending';

  insert into public.ride_events (ride_id, event_type, actor_type, actor_id, payload)
  values (p_ride_id, 'driver_accepted', 'driver', auth.uid(), '{}'::jsonb);

  perform public._create_notification(
    v_ride.passenger_id,
    'ride_status',
    'Driver assigned',
    'Your driver is on the way.',
    jsonb_build_object('ride_id', v_ride.id, 'driver_id', auth.uid())
  );

  return v_ride;
end;
$$;

revoke execute on function public.accept_ride_offer(uuid) from public;
grant execute on function public.accept_ride_offer(uuid) to authenticated;

comment on function public.accept_ride_offer(uuid) is
  'Race-safe ride acceptance. Atomic single-UPDATE, requiring a valid pending offer for the caller in the same WHERE clause, PLUS (20260908070100) a pg_advisory_xact_lock on the calling driver''s uuid and a NOT EXISTS guard ensuring the driver has no other non-terminal ride -- closing the same-driver double-accept race opened once a driver can hold multiple simultaneous pending offers (20260908070000). Returns null (not an error) on a lost race, expired offer, or an already-busy driver.';
