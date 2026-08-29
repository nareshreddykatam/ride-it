-- ============================================================================
-- 20260830090000_admin_command_center_analytics.sql
--
-- Admin Command Center + KLU Pilot analytics. No new tables — every metric
-- here is a read-only aggregate over rides/ride_offers/ride_events/drivers/
-- passengers/payments/subscriptions/wallet_transactions/safety_events,
-- which already carry everything needed (rides alone has requested_at/
-- accepted_at/started_at/completed_at/cancelled_at, exactly the funnel
-- timeline). All functions are:
--   - SECURITY DEFINER with search_path pinned, admin-gated by an explicit
--     `if not public.is_admin() then raise exception` at the top (same
--     pattern as set_safety_event_status/add_safety_event_note) — RLS
--     alone can't gate a GROUP BY aggregate across every passenger's rides,
--     so the function body is the boundary here, checked on every call.
--   - STABLE, not VOLATILE — every one is a pure read.
--   - Aggregated in SQL (COUNT/AVG/SUM/GROUP BY), never "fetch all rows,
--     compute in JS" — the Analytics page's existing getRideTrend() does
--     that for a 7-day window, which is fine at that scale; these
--     functions back a KLU-pilot-wide, potentially 30+-day dashboard and
--     must not scale with row count fetched to the browser.
--   - Careful with zero denominators: every rate is `x / nullif(y, 0)`,
--     returning SQL NULL (not NaN/Infinity) when there's nothing to
--     divide — the client renders that as "—", never a fabricated 0%.
--
-- Two new indexes, justified individually below; nothing else changes.
-- ============================================================================

create index rides_requested_at_idx on public.rides (requested_at desc);
comment on index rides_requested_at_idx is 'Admin analytics scan rides by date range without a status/passenger/driver filter (funnel, daily series, hourly patterns, vehicle analytics, revenue) — the existing rides_active_status_idx and rides_passenger_idx/rides_driver_idx are all partial or user-scoped and do not serve a plain date-range aggregate well.';

create index payments_status_created_idx on public.payments (status, created_at desc);
comment on index payments_status_created_idx is 'Payment-health dashboard groups payments by status within a date range — the existing payments_passenger_idx is user-scoped, not status-scoped.';

-- ----------------------------------------------------------------------------
-- Shared validation helper — every range-taking function below calls this
-- first. Internal only (no client grant): each caller function is itself
-- SECURITY DEFINER and already admin-gated, so this doesn't need its own
-- privilege check, only input sanity.
-- ----------------------------------------------------------------------------
create or replace function public._validate_admin_date_range(p_start timestamptz, p_end timestamptz)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_start is null or p_end is null then
    raise exception 'Date range start/end are required' using errcode = '22023';
  end if;
  if p_end < p_start then
    raise exception 'Range end must not be before range start' using errcode = '22023';
  end if;
  if p_end > now() + interval '1 day' then
    raise exception 'Range end must not be in the future' using errcode = '22023';
  end if;
  if p_end - p_start > interval '400 days' then
    raise exception 'Date range must not exceed 400 days' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public._validate_admin_date_range(timestamptz, timestamptz) from public, authenticated;

-- ============================================================================
-- PHASE 2 — Live ops snapshot ("what is happening right now")
-- ============================================================================
create or replace function public.admin_live_ops_snapshot()
returns table (
  active_rides integer,
  drivers_online integer,
  passengers_riding integer,
  open_ride_requests integer,
  drivers_available integer,
  active_safety_events integer,
  matching_success_rate_24h numeric,
  avg_wait_seconds_24h numeric,
  snapshot_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  with window_rides as (
    -- Last 24h requests, for the two "how healthy is matching right now"
    -- figures — a true instant snapshot has too small a sample; 24h is the
    -- shortest window that's still meaningful for a campus-pilot volume.
    select r.* from public.rides r where r.requested_at > now() - interval '24 hours'
  )
  select
    (select count(*)::integer from public.rides where status in ('accepted', 'driver_arriving', 'ride_started')),
    (select count(*)::integer from public.drivers where is_online = true),
    (select count(distinct passenger_id)::integer from public.rides where status = 'ride_started'),
    (select count(*)::integer from public.rides where status in ('requested', 'matched')),
    (
      select count(*)::integer from public.drivers d
      where d.is_online = true
        and d.verification_status = 'approved'
        and not exists (
          select 1 from public.rides r
          where r.driver_id = d.id and r.status in ('accepted', 'driver_arriving', 'ride_started')
        )
    ),
    (select count(*)::integer from public.safety_events where status not in ('resolved', 'closed')),
    (
      select round(
        100.0 * count(*) filter (where accepted_at is not null) / nullif(count(*), 0), 1
      )
      from window_rides
    ),
    (
      select round(extract(epoch from avg(accepted_at - requested_at)), 0)
      from window_rides where accepted_at is not null
    ),
    now();
end;
$$;

revoke all on function public.admin_live_ops_snapshot() from public;
grant execute on function public.admin_live_ops_snapshot() to authenticated;

comment on function public.admin_live_ops_snapshot() is 'Admin Command Center top strip. active_rides = accepted/driver_arriving/ride_started (has a driver, trip not yet complete). drivers_available = online + approved + not currently on an active ride. matching_success_rate_24h/avg_wait_seconds_24h are a trailing-24h window, not instantaneous — a true instant sample is too small to be meaningful at pilot scale.';

-- ============================================================================
-- PHASE 3 — Ride funnel
-- ============================================================================
create or replace function public.admin_ride_funnel(p_start timestamptz, p_end timestamptz)
returns table (
  requested_count integer,
  matched_count integer,
  accepted_count integer,
  driver_arriving_count integer,
  ride_started_count integer,
  completed_count integer,
  cancelled_user_count integer,
  cancelled_no_drivers_count integer,
  acceptance_rate numeric,
  completion_rate numeric,
  cancellation_rate numeric,
  matching_timeout_rate numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_requested integer;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  perform public._validate_admin_date_range(p_start, p_end);

  select count(*) into v_requested from public.rides where requested_at between p_start and p_end;

  return query
  with r as (select * from public.rides where requested_at between p_start and p_end)
  select
    v_requested,
    -- "Reached matching" = a real ride_offers row exists (dispatch_next_batch's
    -- only side effect on success) — more reliable than status, since status
    -- keeps advancing past 'matched' as the ride progresses.
    (select count(*)::integer from r where exists (select 1 from public.ride_offers o where o.ride_id = r.id)),
    (select count(*)::integer from r where accepted_at is not null),
    -- No dedicated driver_arriving timestamp exists (mark_driver_arriving
    -- only sets status, not a column) — approximated as "accepted AND
    -- (currently driver_arriving OR went on to start)", which undercounts
    -- only the rare case of a ride cancelled during driver_arriving itself.
    (select count(*)::integer from r where accepted_at is not null and (status = 'driver_arriving' or started_at is not null)),
    (select count(*)::integer from r where started_at is not null),
    (select count(*)::integer from r where completed_at is not null),
    (select count(*)::integer from r where status = 'cancelled' and coalesce(cancellation_reason, '') != 'no_drivers_available'),
    (select count(*)::integer from r where status = 'cancelled' and cancellation_reason = 'no_drivers_available'),
    round(100.0 * (select count(*) from r where accepted_at is not null) / nullif((select count(*) from r where exists (select 1 from public.ride_offers o where o.ride_id = r.id)), 0), 1),
    round(100.0 * (select count(*) from r where completed_at is not null) / nullif(v_requested, 0), 1),
    round(100.0 * (select count(*) from r where status = 'cancelled') / nullif(v_requested, 0), 1),
    round(100.0 * (select count(*) from r where status = 'cancelled' and cancellation_reason = 'no_drivers_available') / nullif(v_requested, 0), 1);
end;
$$;

revoke all on function public.admin_ride_funnel(timestamptz, timestamptz) from public;
grant execute on function public.admin_ride_funnel(timestamptz, timestamptz) to authenticated;

comment on function public.admin_ride_funnel(timestamptz, timestamptz) is 'Ride lifecycle funnel for [p_start, p_end] by rides.requested_at. acceptance_rate = accepted / matched (not / requested) — the rate that actually reflects driver behavior once offered a ride, distinct from completion_rate which is / requested. All rates null (not 0) when their denominator is zero.';

-- ============================================================================
-- PHASE 4 — Passenger metrics
-- ============================================================================
create or replace function public.admin_passenger_metrics(p_start timestamptz, p_end timestamptz)
returns table (
  registered_count integer,
  active_count integer,
  new_count integer,
  returning_count integer,
  avg_rides_per_active numeric,
  avg_spend numeric,
  cancellation_rate numeric,
  repeat_usage_rate numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_active integer;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  perform public._validate_admin_date_range(p_start, p_end);

  -- "Active" = requested at least one ride in the range — a real activity
  -- signal, never inferred from merely having an account.
  select count(distinct r.passenger_id) into v_active from public.rides r where r.requested_at between p_start and p_end;

  return query
  select
    (select count(*)::integer from public.passengers),
    v_active,
    (select count(*)::integer from public.passengers p join public.users u on u.id = p.id where u.created_at between p_start and p_end),
    -- "Returning" = active in this range AND had already requested a ride
    -- before this range started — an existing user coming back, not a
    -- first-timer.
    (
      select count(distinct r.passenger_id)::integer from public.rides r
      where r.requested_at between p_start and p_end
        and exists (select 1 from public.rides r2 where r2.passenger_id = r.passenger_id and r2.requested_at < p_start)
    ),
    round((select count(*) from public.rides where requested_at between p_start and p_end)::numeric / nullif(v_active, 0), 2),
    round((select avg(total_fare) from public.rides where completed_at between p_start and p_end), 2),
    round(100.0 * (select count(*) from public.rides where requested_at between p_start and p_end and status = 'cancelled' and cancelled_by = 'passenger')
      / nullif((select count(*) from public.rides where requested_at between p_start and p_end), 0), 1),
    round(100.0 * (
      select count(*) from (
        select passenger_id from public.rides where requested_at between p_start and p_end group by passenger_id having count(*) > 1
      ) multi
    ) / nullif(v_active, 0), 1);
end;
$$;

revoke all on function public.admin_passenger_metrics(timestamptz, timestamptz) from public;
grant execute on function public.admin_passenger_metrics(timestamptz, timestamptz) to authenticated;

comment on function public.admin_passenger_metrics(timestamptz, timestamptz) is 'active_count = distinct passengers with >=1 ride request in range (a real activity signal, not account existence). avg_spend = AVG(rides.total_fare) over rides.completed_at in range. repeat_usage_rate = % of active passengers with >1 request within THIS range (a within-window repeat signal, distinct from returning_count which looks for prior-range history).';

-- ============================================================================
-- PHASE 5 — Driver metrics
-- ============================================================================
create or replace function public.admin_driver_metrics(p_start timestamptz, p_end timestamptz)
returns table (
  registered_count integer,
  verified_count integer,
  active_count integer,
  online_count integer,
  subscribed_count integer,
  completing_rides_count integer,
  avg_rides_per_active numeric,
  acceptance_rate numeric,
  cancellation_rate numeric,
  rides_per_driver_day numeric,
  avg_earnings numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_active integer;
  v_days numeric;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  perform public._validate_admin_date_range(p_start, p_end);

  select count(distinct r.driver_id) into v_active from public.rides r where r.completed_at between p_start and p_end;
  v_days := greatest(extract(epoch from (p_end - p_start)) / 86400.0, 1);

  return query
  select
    (select count(*)::integer from public.drivers),
    (select count(*)::integer from public.drivers where verification_status = 'approved'),
    v_active,
    (select count(*)::integer from public.drivers where is_online = true),
    (select count(*)::integer from public.subscriptions where status = 'active'),
    v_active,
    round((select count(*) from public.rides where completed_at between p_start and p_end)::numeric / nullif(v_active, 0), 2),
    -- Driver-side acceptance: of every offer actually extended to a driver
    -- (ride_offers.offered_at in range), what fraction were accepted —
    -- distinct from admin_ride_funnel's ride-side acceptance_rate.
    round(100.0 * (select count(*) from public.ride_offers where offered_at between p_start and p_end and status = 'accepted')
      / nullif((select count(*) from public.ride_offers where offered_at between p_start and p_end), 0), 1),
    round(100.0 * (select count(*) from public.rides where requested_at between p_start and p_end and status = 'cancelled' and cancelled_by = 'driver')
      / nullif((select count(*) from public.rides where requested_at between p_start and p_end and accepted_at is not null), 0), 1),
    -- Proxy, not true idle/busy utilization (no online-session history
    -- table exists to compute that) — explicitly labeled as such on the
    -- client, never presented as a real utilization percentage.
    round((select count(*) from public.rides where completed_at between p_start and p_end)::numeric
      / nullif((select count(*) from public.drivers where is_online = true) * v_days, 0), 2),
    round((
      select avg(driver_total) from (
        select wt.wallet_id, sum(wt.amount) as driver_total
        from public.wallet_transactions wt
        where wt.reason = 'ride_earning' and wt.created_at between p_start and p_end
        group by wt.wallet_id
      ) per_driver
    ), 2);
end;
$$;

revoke all on function public.admin_driver_metrics(timestamptz, timestamptz) from public;
grant execute on function public.admin_driver_metrics(timestamptz, timestamptz) to authenticated;

comment on function public.admin_driver_metrics(timestamptz, timestamptz) is 'active_count = distinct drivers with >=1 completed ride in range. rides_per_driver_day is a PROXY for utilization (completed rides / (online drivers x days)) — there is no online/offline session-history table to compute true busy-time fraction; the client must label this as a proxy, never as real utilization %. avg_earnings = AVG per-driver SUM(wallet_transactions.amount) where reason=ride_earning in range — real ledger data, not estimated.';

-- ============================================================================
-- PHASE 6 — Vehicle analytics
-- ============================================================================
create or replace function public.admin_vehicle_analytics(p_start timestamptz, p_end timestamptz)
returns table (
  vehicle_type text,
  requests integer,
  completed integer,
  cancelled integer,
  avg_fare numeric,
  avg_distance_km numeric,
  avg_duration_seconds numeric,
  avg_wait_seconds numeric,
  acceptance_rate numeric,
  completion_rate numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  perform public._validate_admin_date_range(p_start, p_end);

  return query
  select
    r.vehicle_type::text,
    count(*)::integer,
    count(*) filter (where r.completed_at is not null)::integer,
    count(*) filter (where r.status = 'cancelled')::integer,
    round(avg(r.total_fare) filter (where r.completed_at is not null), 2),
    round(avg(r.distance_km) filter (where r.completed_at is not null), 2),
    round(extract(epoch from (avg(r.completed_at - r.started_at) filter (where r.completed_at is not null and r.started_at is not null))), 0),
    round(extract(epoch from (avg(r.accepted_at - r.requested_at) filter (where r.accepted_at is not null))), 0),
    round(100.0 * count(*) filter (where r.accepted_at is not null) / nullif(count(*) filter (where exists (select 1 from public.ride_offers o where o.ride_id = r.id)), 0), 1),
    round(100.0 * count(*) filter (where r.completed_at is not null) / nullif(count(*), 0), 1)
  from public.rides r
  where r.requested_at between p_start and p_end
  group by r.vehicle_type
  order by count(*) desc;
end;
$$;

revoke all on function public.admin_vehicle_analytics(timestamptz, timestamptz) from public;
grant execute on function public.admin_vehicle_analytics(timestamptz, timestamptz) to authenticated;

comment on function public.admin_vehicle_analytics(timestamptz, timestamptz) is 'One row per vehicle_type (auto/bike/scooty/car), rides.requested_at in range. Only vehicle types with at least one request in range appear — no fabricated zero-rows for unused types.';

-- ============================================================================
-- PHASE 7 — Revenue / payments
-- ============================================================================
create or replace function public.admin_revenue_metrics(p_start timestamptz, p_end timestamptz)
returns table (
  gmv numeric,
  online_volume numeric,
  cash_volume numeric,
  driver_upi_volume numeric,
  payments_captured_count integer,
  payments_failed_count integer,
  payments_pending_count integer,
  payments_refunded_amount numeric,
  avg_fare numeric,
  subscriptions_active_count integer,
  subscriptions_expired_count integer,
  subscription_revenue numeric,
  subscription_payment_success_rate numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  perform public._validate_admin_date_range(p_start, p_end);

  return query
  select
    -- GMV = ride fare volume actually paid, ALL payment methods. Explicitly
    -- NOT called "RideIT revenue" — see 0007_subscriptions.sql: RideIT's
    -- entire revenue model is the flat driver subscription, not a per-ride
    -- commission. This is analytics-only passenger-to-driver fare volume.
    (select coalesce(sum(total_fare), 0) from public.rides where completed_at between p_start and p_end and payment_status = 'paid'),
    (select coalesce(sum(total_fare), 0) from public.rides where completed_at between p_start and p_end and payment_status = 'paid' and payment_method = 'online'),
    (select coalesce(sum(total_fare), 0) from public.rides where completed_at between p_start and p_end and payment_status = 'paid' and payment_method = 'cash'),
    (select coalesce(sum(total_fare), 0) from public.rides where completed_at between p_start and p_end and payment_status = 'paid' and payment_method = 'driver_upi'),
    (select count(*)::integer from public.payments where status = 'captured' and captured_at between p_start and p_end),
    (select count(*)::integer from public.payments where status = 'failed' and failed_at between p_start and p_end),
    (select count(*)::integer from public.payments where status in ('created', 'pending', 'authorized') and created_at between p_start and p_end),
    (select coalesce(sum(refunded_amount), 0) from public.payments where refunded_at between p_start and p_end),
    (select round(avg(total_fare), 2) from public.rides where completed_at between p_start and p_end and payment_status = 'paid'),
    (select count(*)::integer from public.subscriptions where status = 'active'),
    (select count(*)::integer from public.subscriptions where status = 'expired' and updated_at between p_start and p_end),
    -- The ONLY figure here that is genuinely RideIT's own revenue.
    (select coalesce(sum(amount), 0) from public.subscription_payments where status = 'paid' and paid_at between p_start and p_end),
    round(100.0 * (select count(*) from public.subscription_payments where status = 'paid' and created_at between p_start and p_end)
      / nullif((select count(*) from public.subscription_payments where created_at between p_start and p_end), 0), 1);
end;
$$;

revoke all on function public.admin_revenue_metrics(timestamptz, timestamptz) from public;
grant execute on function public.admin_revenue_metrics(timestamptz, timestamptz) to authenticated;

comment on function public.admin_revenue_metrics(timestamptz, timestamptz) is 'gmv/online_volume/cash_volume/driver_upi_volume are ride FARE volume (rides.total_fare where payment_status=''paid''), never labeled platform revenue. subscription_revenue is the only field here that is actually RideIT''s own collected revenue (see 0007_subscriptions.sql: subscription-based model, zero ride commission). No commission/settlement ledger exists in this schema, so none is fabricated here.';

-- ============================================================================
-- PHASE 8 — KLU Pilot summary + time-series
-- ============================================================================
create or replace function public.admin_klu_pilot_summary()
returns table (
  total_users integer,
  active_users_7d integer,
  registered_drivers integer,
  verified_drivers integer,
  completed_rides_total integer,
  completed_rides_today integer,
  completed_rides_7d integer,
  gmv_total numeric,
  avg_fare numeric,
  avg_wait_seconds numeric,
  cancellation_rate numeric,
  repeat_passenger_rate numeric,
  active_safety_events integer,
  payment_success_rate numeric,
  earliest_ride_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_today_start timestamptz := date_trunc('day', now());
  v_7d_start timestamptz := now() - interval '7 days';
  v_total_passengers integer;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select count(*) into v_total_passengers from public.passengers;

  return query
  select
    (select count(*)::integer from public.passengers) + (select count(*)::integer from public.drivers),
    (
      (select count(distinct passenger_id) from public.rides where requested_at > v_7d_start)
      + (select count(distinct driver_id) from public.rides where requested_at > v_7d_start and driver_id is not null)
    )::integer,
    (select count(*)::integer from public.drivers),
    (select count(*)::integer from public.drivers where verification_status = 'approved'),
    (select count(*)::integer from public.rides where completed_at is not null),
    (select count(*)::integer from public.rides where completed_at >= v_today_start),
    (select count(*)::integer from public.rides where completed_at > v_7d_start),
    (select coalesce(sum(total_fare), 0) from public.rides where payment_status = 'paid' and completed_at is not null),
    (select round(avg(total_fare), 2) from public.rides where payment_status = 'paid' and completed_at is not null),
    (select round(extract(epoch from avg(accepted_at - requested_at)), 0) from public.rides where accepted_at is not null and requested_at > v_7d_start),
    round(100.0 * (select count(*) from public.rides where status = 'cancelled') / nullif((select count(*) from public.rides), 0), 1),
    round(100.0 * (
      select count(*) from (
        select passenger_id from public.rides where completed_at is not null group by passenger_id having count(*) > 1
      ) repeaters
    ) / nullif(v_total_passengers, 0), 1),
    (select count(*)::integer from public.safety_events where status not in ('resolved', 'closed')),
    round(100.0 * (select count(*) from public.payments where status = 'captured') / nullif((select count(*) from public.payments), 0), 1),
    (select min(requested_at) from public.rides);
end;
$$;

revoke all on function public.admin_klu_pilot_summary() from public;
grant execute on function public.admin_klu_pilot_summary() to authenticated;

comment on function public.admin_klu_pilot_summary() is 'Top-level KLU Pilot KPIs, mostly all-time (earliest_ride_at tells the client how much real history exists, so a near-empty pilot renders honestly rather than a misleadingly flat chart). active_users_7d sums distinct passengers + distinct drivers with ride activity in the last 7 days — a person who is both is not double-counted within each role, but a passenger and a driver account are two different people in this schema so summing the two role counts is correct, not a double-count.';

create or replace function public.admin_daily_series(p_days integer default 30)
returns table (
  day date,
  requests integer,
  completed integer,
  new_passengers integer,
  new_drivers integer,
  gmv numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_start timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 400 then
    raise exception 'p_days must be between 1 and 400' using errcode = '22023';
  end if;
  v_start := date_trunc('day', now()) - ((p_days - 1) || ' days')::interval;

  return query
  select
    d::date,
    coalesce((select count(*) from public.rides r where date_trunc('day', r.requested_at) = d), 0)::integer,
    coalesce((select count(*) from public.rides r where date_trunc('day', r.completed_at) = d), 0)::integer,
    coalesce((select count(*) from public.passengers p join public.users u on u.id = p.id where date_trunc('day', u.created_at) = d), 0)::integer,
    coalesce((select count(*) from public.drivers dr join public.users u on u.id = dr.id where date_trunc('day', u.created_at) = d), 0)::integer,
    coalesce((select sum(r.total_fare) from public.rides r where date_trunc('day', r.completed_at) = d and r.payment_status = 'paid'), 0)
  from generate_series(v_start, date_trunc('day', now()), interval '1 day') as d
  order by d;
end;
$$;

revoke all on function public.admin_daily_series(integer) from public;
grant execute on function public.admin_daily_series(integer) to authenticated;

comment on function public.admin_daily_series(integer) is 'One row per calendar day for the trailing p_days (default 30, capped at 400) — backs the daily-rides, passenger-growth, driver-growth, GMV, and completed-rides charts from a single call instead of five. Days with zero activity are real zero rows (generate_series), not gaps — a sparse pilot renders as an honest flat/low line, never interpolated.';

-- ============================================================================
-- PHASE 9 / 11 — Hourly + weekday demand patterns (also backs the
-- supply/demand "unmatched requests by hour" signal — see comment below)
-- ============================================================================
create or replace function public.admin_hourly_patterns(p_days integer default 30)
returns table (
  hour_of_day integer,
  total_requests integer,
  completed integer,
  matching_exhausted integer,
  avg_wait_seconds numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_start timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 400 then
    raise exception 'p_days must be between 1 and 400' using errcode = '22023';
  end if;
  v_start := now() - (p_days || ' days')::interval;

  return query
  select
    h::integer,
    coalesce((select count(*) from public.rides r where r.requested_at > v_start and extract(hour from r.requested_at) = h), 0)::integer,
    coalesce((select count(*) from public.rides r where r.requested_at > v_start and extract(hour from r.requested_at) = h and r.completed_at is not null), 0)::integer,
    -- matching_exhausted ride_events are the real, DB-recorded signal for
    -- "demand outstripped available drivers at this hour" — there is no
    -- online-driver-count history table, so this proxy (requests that
    -- genuinely ran out of eligible drivers, from dispatch_next_batch's
    -- own matching_exhausted event) stands in for it honestly rather than
    -- fabricating a supply time series.
    coalesce((
      select count(*) from public.ride_events e
      where e.event_type = 'matching_exhausted' and e.created_at > v_start and extract(hour from e.created_at) = h
    ), 0)::integer,
    round(extract(epoch from (avg(r.accepted_at - r.requested_at) filter (where r.accepted_at is not null))), 0)
  from generate_series(0, 23) as h
  left join public.rides r on r.requested_at > v_start and extract(hour from r.requested_at) = h
  group by h
  order by h;
end;
$$;

revoke all on function public.admin_hourly_patterns(integer) from public;
grant execute on function public.admin_hourly_patterns(integer) to authenticated;

comment on function public.admin_hourly_patterns(integer) is 'One row per hour-of-day (0-23), trailing p_days. Peak/low-demand hours are read off total_requests directly — never hardcoded. matching_exhausted is the real, recorded proxy for demand > supply at that hour (from ride_events, the same rows dispatch_next_batch writes when it gives up after matching_max_batches); there is no online-driver-count history to build a true supply time series from.';

create or replace function public.admin_rides_by_weekday(p_days integer default 30)
returns table (
  weekday integer,
  weekday_label text,
  total_requests integer,
  completed integer,
  cancelled integer
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_start timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 400 then
    raise exception 'p_days must be between 1 and 400' using errcode = '22023';
  end if;
  v_start := now() - (p_days || ' days')::interval;

  return query
  select
    w::integer,
    -- date_trunc('week', ...) is ISO-based and returns a Monday; EXTRACT(DOW)
    -- (the convention `w` itself uses, 0=Sunday) is not ISO — subtracting a
    -- day first gives a real Sunday as the reference point so `w` days
    -- past it lands on the matching weekday, not one day off.
    to_char((date_trunc('week', now()) - interval '1 day') + (w || ' days')::interval, 'Dy'),
    coalesce((select count(*) from public.rides r where r.requested_at > v_start and extract(dow from r.requested_at) = w), 0)::integer,
    coalesce((select count(*) from public.rides r where r.requested_at > v_start and extract(dow from r.requested_at) = w and r.completed_at is not null), 0)::integer,
    coalesce((select count(*) from public.rides r where r.requested_at > v_start and extract(dow from r.requested_at) = w and r.status = 'cancelled'), 0)::integer
  from generate_series(0, 6) as w
  order by w;
end;
$$;

revoke all on function public.admin_rides_by_weekday(integer) from public;
grant execute on function public.admin_rides_by_weekday(integer) to authenticated;

comment on function public.admin_rides_by_weekday(integer) is 'One row per weekday (0=Sunday..6=Saturday, PostgreSQL EXTRACT(DOW) convention), trailing p_days. weekday_label is derived, not hardcoded, from an arbitrary reference Sunday + w days.';

-- ============================================================================
-- PHASE 10 — Top locations
-- ============================================================================
create or replace function public.admin_top_locations(p_start timestamptz, p_end timestamptz, p_limit integer default 10)
returns table (
  kind text,
  address text,
  request_count integer
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  perform public._validate_admin_date_range(p_start, p_end);
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'p_limit must be between 1 and 50' using errcode = '22023';
  end if;

  return query
  (
    select 'pickup'::text, r.pickup_address, count(*)::integer
    from public.rides r
    where r.requested_at between p_start and p_end and r.pickup_address is not null
    group by r.pickup_address
    order by count(*) desc
    limit p_limit
  )
  union all
  (
    select 'drop'::text, r.drop_address, count(*)::integer
    from public.rides r
    where r.requested_at between p_start and p_end and r.drop_address is not null
    group by r.drop_address
    order by count(*) desc
    limit p_limit
  );
end;
$$;

revoke all on function public.admin_top_locations(timestamptz, timestamptz, integer) from public;
grant execute on function public.admin_top_locations(timestamptz, timestamptz, integer) to authenticated;

comment on function public.admin_top_locations(timestamptz, timestamptz, integer) is 'Top p_limit pickup and drop addresses by literal text frequency (rides.pickup_address/drop_address, free-text passenger input) in range. Real campus locations (Main Gate, hostels, etc.) surface naturally here if and only if passengers actually typed them — never a hardcoded/geofenced campus-zone list.';

-- ============================================================================
-- PHASE 13 — Payment health
-- ============================================================================
create or replace function public.admin_payment_health(p_start timestamptz, p_end timestamptz)
returns table (
  online_success_count integer,
  online_failure_count integer,
  online_pending_count integer,
  online_refunded_count integer,
  online_refunded_amount numeric,
  webhook_events_count integer,
  webhook_unprocessed_count integer,
  subscription_paid_count integer,
  subscription_failed_count integer
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  perform public._validate_admin_date_range(p_start, p_end);

  return query
  select
    (select count(*)::integer from public.payments where status = 'captured' and created_at between p_start and p_end),
    (select count(*)::integer from public.payments where status = 'failed' and created_at between p_start and p_end),
    (select count(*)::integer from public.payments where status in ('created', 'pending', 'authorized') and created_at between p_start and p_end),
    (select count(*)::integer from public.payments where status in ('refunded', 'partially_refunded') and created_at between p_start and p_end),
    (select coalesce(sum(refunded_amount), 0) from public.payments where refunded_at between p_start and p_end),
    (select count(*)::integer from public.payment_webhook_events where created_at between p_start and p_end),
    -- Webhooks stuck unprocessed for >10 minutes — a real, DB-recorded lag
    -- signal. process_payment_webhook_event sets processed_at itself; a
    -- persistently-null row past that threshold means either the webhook
    -- handler errored or Razorpay never confirmed the event — both worth
    -- an admin's attention.
    (select count(*)::integer from public.payment_webhook_events where processed_at is null and created_at between p_start and p_end and created_at < now() - interval '10 minutes'),
    (select count(*)::integer from public.subscription_payments where status = 'paid' and created_at between p_start and p_end),
    (select count(*)::integer from public.subscription_payments where status = 'failed' and created_at between p_start and p_end);
end;
$$;

revoke all on function public.admin_payment_health(timestamptz, timestamptz) from public;
grant execute on function public.admin_payment_health(timestamptz, timestamptz) to authenticated;

comment on function public.admin_payment_health(timestamptz, timestamptz) is 'Gateway-level payment health from public.payments/payment_webhook_events/subscription_payments. Cannot observe order-creation API failures that happened before any payments row was written (that failure occurs client-side, before any DB write exists to query) — this is a real, stated limitation, not represented by any field here. Duplicate webhook deliveries are prevented by payment_webhook_events''s own (provider, provider_event_id) unique constraint, so a "duplicates blocked" count is not directly observable from data (a blocked insert leaves no row) and is not fabricated here either.';

-- ============================================================================
-- PHASE 12 — Safety analytics (extends the existing Safety dashboard)
-- ============================================================================
create or replace function public.admin_safety_analytics(p_start timestamptz, p_end timestamptz)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  perform public._validate_admin_date_range(p_start, p_end);

  select jsonb_build_object(
    'by_status', (
      select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      from (select status::text, count(*) as cnt from public.safety_events where created_at between p_start and p_end group by status) s
    ),
    'by_severity', (
      select coalesce(jsonb_object_agg(severity, cnt), '{}'::jsonb)
      from (select severity::text, count(*) as cnt from public.safety_events where created_at between p_start and p_end group by severity) s
    ),
    'by_vehicle_type', (
      select coalesce(jsonb_object_agg(vehicle_type, cnt), '{}'::jsonb)
      from (
        select coalesce(r.vehicle_type::text, 'no_ride') as vehicle_type, count(*) as cnt
        from public.safety_events se
        left join public.rides r on r.id = se.ride_id
        where se.created_at between p_start and p_end
        group by coalesce(r.vehicle_type::text, 'no_ride')
      ) s
    ),
    'by_hour', (
      select coalesce(jsonb_object_agg(hour_of_day, cnt), '{}'::jsonb)
      from (
        select extract(hour from created_at)::text as hour_of_day, count(*) as cnt
        from public.safety_events where created_at between p_start and p_end
        group by extract(hour from created_at)
      ) s
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_safety_analytics(timestamptz, timestamptz) from public;
grant execute on function public.admin_safety_analytics(timestamptz, timestamptz) to authenticated;

comment on function public.admin_safety_analytics(timestamptz, timestamptz) is 'safety_events grouped four ways (status/severity/vehicle_type-via-ride/hour) for [p_start, p_end] by created_at, returned as one jsonb object rather than four round-trips. by_vehicle_type buckets an SOS with no ride_id under "no_ride" rather than dropping it. Admin-only, same as every other function here — this never widens who can read safety_events itself.';
