-- ============================================================================
-- 20260907093000_advance_ride_matching_ownership_check.sql
--
-- Found while reproducing the /booking/matching crash report (2026-09-07):
-- advance_ride_matching() checks `auth.uid() is not null` but never that the
-- caller actually OWNS the ride (p_ride_id) it's operating on — unlike its
-- sibling passenger_cancel_matching_ride(), which already scopes its UPDATE
-- to `passenger_id = auth.uid()`. Any authenticated user (passenger or
-- driver) who knew or guessed a rideId could call advance_ride_matching()
-- on a ride that isn't theirs, and it would fully process that ride's
-- matching state on their behalf: expire/dispatch offers, and — since it
-- also re-checks the minimum search window — potentially cancel a ride that
-- had genuinely been searching for longer than matching_minimum_search_
-- seconds, before its own real passenger's client ever got a chance to.
-- (This was reproduced live and caused exactly that: an unrelated
-- authenticated session's page visit advanced a real passenger's already-
-- overdue ride to 'cancelled' — a real side effect of the missing check,
-- not just a theoretical one, though in this specific case the ride's
-- 180-second minimum search window had already elapsed by over 10 minutes,
-- so the same cancellation was already inevitable the next time ANY caller,
-- including that ride's own passenger, next advanced it.)
--
-- Fix: require passenger_id = auth.uid(), the exact same ownership check
-- passenger_cancel_matching_ride() already uses. Matches (and does not
-- alter) every existing matching rule -- minimum search window, batch
-- throttling, batch cap, offer duration are all untouched.
-- ============================================================================

create or replace function public.advance_ride_matching(p_ride_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.ride_status_enum;
  v_pending_count integer;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select status into v_status from public.rides where id = p_ride_id and passenger_id = auth.uid();
  if v_status is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if v_status not in ('requested', 'matched') then
    return v_status::text;
  end if;

  update public.ride_offers
  set status = 'expired', responded_at = now()
  where ride_id = p_ride_id and status = 'pending' and expires_at <= now();

  select count(*) into v_pending_count
  from public.ride_offers
  where ride_id = p_ride_id and status = 'pending' and expires_at > now();

  if v_pending_count = 0 then
    perform public.dispatch_next_batch(p_ride_id);
  end if;

  select status into v_status from public.rides where id = p_ride_id;
  return v_status::text;
end;
$$;

comment on function public.advance_ride_matching(uuid) is
  'The matching heartbeat, called by the Passenger app''s Matching screen. 20260907: now requires passenger_id = auth.uid() (matching passenger_cancel_matching_ride''s existing ownership check) -- previously any authenticated caller could advance/cancel a ride that was not theirs.';
