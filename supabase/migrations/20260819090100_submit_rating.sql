-- ============================================================================
-- 20260819090100_submit_rating.sql
-- Phase 15. The real rating submission flow.
--
-- REAL GAP FOUND: ratings_insert_participant (Phase 3) checks only that
-- the caller is A participant of SOME ride matching ride_id, and that
-- rater_id = auth.uid() — it never verifies ratee_id is actually the
-- OTHER participant on THAT SPECIFIC ride (a passenger could set
-- ratee_id to any user), never verifies rated_by matches the caller's
-- real role on the ride (a passenger could insert rated_by='driver'),
-- and never checks the ride is actually completed. This is exactly what
-- the brief means by "do not allow a client to simply insert rating/
-- ride_id/reviewer_id/reviewee_id and bypass authorization." Fixed by
-- removing direct client INSERT access entirely — submit_rating() below
-- is the sole path, deriving rated_by/ratee_id/completion state from the
-- ride record itself, never from client-supplied values.
-- ============================================================================

drop policy if exists "ratings_insert_participant" on public.ratings;
-- No insert policy remains for authenticated users — only submit_rating()
-- (SECURITY DEFINER) and admin (ratings_all_admin, unchanged) can write.

-- ----------------------------------------------------------------------------
-- submit_rating — every authorization fact is derived from the ride
-- record itself, never trusted from a parameter:
--   - rated_by / ratee_id: derived from which side of the ride auth.uid()
--     actually is, not accepted as input at all
--   - completion state: the ride's own status, checked against the same
--     eligible-state set Phase 11's create_pending_ride_payment already
--     established ('ride_completed', 'payment', 'rated') — for
--     consistency across the codebase's interpretation of "the ride is
--     over"
--   - duplicate prevention: the existing ratings_one_per_ride_direction
--     unique constraint (Phase 3) is the real backstop; this function
--     doesn't need to duplicate that check, just let the constraint do
--     its job
--
-- 'rated' status interpretation (item 19 of the brief, documented rather
-- than silently decided): ride_status_enum has included 'rated' since
-- Phase 3, but nothing before this phase ever transitioned a ride into
-- it. This function advances a ride from 'ride_completed'/'payment' to
-- 'rated' on the FIRST rating submitted from either direction — not
-- requiring both sides to rate, since mutual rating is independent and
-- optional, and a ride stuck waiting forever for a rating that may never
-- come would be a worse outcome than a status that reflects "at least
-- one side has rated" rather than "both sides have."
-- ----------------------------------------------------------------------------
create or replace function public.submit_rating(p_ride_id uuid, p_rating smallint, p_comment text default null)
returns public.ratings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
  v_rated_by public.rated_by_enum;
  v_ratee_id uuid;
  v_comment text;
  v_rating public.ratings;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if p_rating not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5' using errcode = '22023';
  end if;

  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if v_ride.passenger_id = auth.uid() then
    v_rated_by := 'passenger';
    v_ratee_id := v_ride.driver_id;
  elsif v_ride.driver_id = auth.uid() then
    v_rated_by := 'driver';
    v_ratee_id := v_ride.passenger_id;
  else
    raise exception 'Caller did not participate in this ride' using errcode = '42501';
  end if;

  if v_ratee_id is null then
    raise exception 'Ride has no counterpart to rate' using errcode = 'P0001';
  end if;

  if v_ride.status not in ('ride_completed', 'payment', 'rated') then
    raise exception 'Ride is not yet completed' using errcode = 'P0001';
  end if;

  v_comment := nullif(trim(coalesce(p_comment, '')), '');
  if v_comment is not null then
    if length(v_comment) > 1000 then
      raise exception 'Review is too long (max 1000 characters)' using errcode = '22023';
    end if;
    if v_comment ilike '%<script%' then
      raise exception 'Review contains disallowed content' using errcode = '22023';
    end if;
  end if;

  insert into public.ratings (ride_id, rated_by, rater_id, ratee_id, rating, comment)
  values (p_ride_id, v_rated_by, auth.uid(), v_ratee_id, p_rating, v_comment)
  returning * into v_rating;

  perform public._mark_trusted_write();

  if v_rated_by = 'passenger' then
    update public.rides set driver_rating = p_rating where id = p_ride_id;
  else
    update public.rides set passenger_rating = p_rating where id = p_ride_id;
  end if;

  update public.rides
  set status = 'rated'
  where id = p_ride_id and status in ('ride_completed', 'payment');

  if v_rated_by = 'passenger' then
    update public.drivers
    set rating = (select round(avg(rating)::numeric, 1) from public.ratings where ratee_id = v_ratee_id),
        total_rides = total_rides + 1
    where id = v_ratee_id;
  else
    update public.passengers
    set rating = (select round(avg(rating)::numeric, 1) from public.ratings where ratee_id = v_ratee_id),
        total_rides = total_rides + 1
    where id = v_ratee_id;
  end if;

  perform public._create_notification(
    v_ratee_id,
    'ride_status',
    'You received a new rating',
    format('You were rated %s star%s for a recent ride.', p_rating, case when p_rating = 1 then '' else 's' end),
    jsonb_build_object('ride_id', p_ride_id, 'rating_id', v_rating.id)
  );

  return v_rating;
end;
$$;

revoke execute on function public.submit_rating(uuid, smallint, text) from public;
grant execute on function public.submit_rating(uuid, smallint, text) to authenticated;

comment on function public.submit_rating(uuid, smallint, text) is 'The sole path for creating a rating. rated_by/ratee_id are derived from the ride record, never accepted as parameters. Duplicate submission is blocked by the existing ratings_one_per_ride_direction unique constraint (Phase 3), not re-implemented here.';
