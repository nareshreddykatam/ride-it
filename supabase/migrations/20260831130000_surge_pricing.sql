-- ============================================================================
-- 20260831130000_surge_pricing.sql
--
-- Admin-controlled, server-authoritative surge pricing. Built directly on
-- top of the existing fare architecture (pricing_rules + compute_ride_fare()
-- from 20260831110000) — no second, parallel fare formula.
--
-- ARCHITECTURE:
--   - pricing_rules.surge_multiplier — ONE per vehicle type (reuses the
--     existing per-vehicle row rather than a new table), the multiplier an
--     admin has configured FOR THAT VEHICLE. Defaults to 1.00 (no surge).
--   - app_settings: surge_enabled (master on/off), surge_max_multiplier
--     (global admin-configurable ceiling), surge_starts_at/surge_ends_at
--     (optional scheduled window, nullable — manual on/off if unset).
--     Same pattern as every other admin tunable in this schema
--     (_get_matching_setting_int, referral settings) — no new config
--     mechanism invented.
--   - rides.surge_multiplier — snapshot of what was ACTUALLY applied to
--     this specific ride, set once at creation by compute_ride_fare() and
--     never recomputed later, same snapshot philosophy as the referral
--     system's reward_amount. This is what makes "old rides keep their
--     fare, new rides use the new multiplier" true by construction, and
--     is what a future passenger/driver transparency UI would read to
--     show a breakdown (base vs. surge-adjusted).
--
-- PRECEDENCE RULE (documented, not ambiguous): there is no separate
-- "global multiplier" distinct from each vehicle's own value — the
-- effective multiplier for a ride is:
--   1.00                                   if surge_enabled = false
--   1.00                                   if a scheduled window is set and
--                                           now() is outside it
--   least(pricing_rules.surge_multiplier,  otherwise — the vehicle's own
--         surge_max_multiplier, 5.00)      configured multiplier, capped by
--                                           the admin's global max AND by an
--                                           absolute hard safety ceiling
--                                           (5.00x) that no setting can
--                                           override.
-- Exactly one authoritative value per vehicle per ride; nothing to
-- disambiguate.
--
-- FORMULA (documented — not "multiply everything blindly"): the multiplier
-- scales base_fare and distance_fare individually (both derived from the
-- SAME pricing_rules row compute_ride_fare() already reads), so the
-- existing rides_total_fare_matches_components CHECK constraint
-- (total_fare = base_fare + distance_fare - discount_amount) continues to
-- hold with zero schema/constraint change. discount_amount is
-- deliberately NOT scaled by surge — a promo discount is a fixed
-- reduction, not something surge should inflate. When surge_enabled is
-- false, the effective multiplier is exactly 1.00, which reproduces the
-- pre-surge fare bit-for-bit (round(x * 1.00, 2) = x for the already-
-- rounded pre-surge values) — this migration does not change any
-- existing no-surge fare.
-- ============================================================================

alter table public.pricing_rules
  add column if not exists surge_multiplier numeric(4, 2) not null default 1.00;

alter table public.pricing_rules
  add constraint pricing_rules_surge_multiplier_valid
    check (surge_multiplier >= 1.00 and surge_multiplier <= 5.00);

comment on column public.pricing_rules.surge_multiplier is 'Admin-configured surge multiplier for this vehicle type, applied only while app_settings.surge_enabled is true (and, if set, within the surge_starts_at/surge_ends_at window) — see compute_ride_fare(). 1.00 = no surge. Hard-capped at 5.00x independent of the admin-configurable surge_max_multiplier setting.';

alter table public.rides
  add column if not exists surge_multiplier numeric(4, 2) not null default 1.00;

alter table public.rides
  add constraint rides_surge_multiplier_valid
    check (surge_multiplier >= 1.00 and surge_multiplier <= 5.00);

comment on column public.rides.surge_multiplier is 'Snapshot of the surge multiplier actually applied to THIS ride at creation time (set once by compute_ride_fare(), never recomputed) — 1.00 if surge was off or not applicable. The source for any future passenger/driver fare-breakdown UI: normal_base = base_fare / surge_multiplier, etc.';

insert into public.app_settings (key, value, description) values
  ('surge_enabled', 'false', 'Master switch for surge pricing. Off by default — an admin must deliberately turn it on. When false, every ride is charged at exactly the configured pricing_rules rate regardless of any vehicle''s surge_multiplier value.'),
  ('surge_max_multiplier', '2.00', 'Global ceiling applied to every vehicle''s surge_multiplier, enforced server-side inside compute_ride_fare() — independent of and in addition to the absolute 5.00x hard cap on pricing_rules.surge_multiplier itself.'),
  ('surge_starts_at', 'null', 'Optional scheduled surge window start (ISO 8601 timestamp, or JSON null for "no schedule — manual on/off only via surge_enabled"). Both surge_starts_at and surge_ends_at must be set for the window to apply.'),
  ('surge_ends_at', 'null', 'Optional scheduled surge window end — see surge_starts_at. Once now() passes this time, compute_ride_fare() automatically stops applying surge to new rides; no cron/scheduled job needed, checked at the point of use exactly like every other time-window check in this schema (e.g. pricing_rules.effective_to).')
on conflict (key) do nothing;

create or replace function public._get_app_setting_timestamptz(p_key text, p_default timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::timestamptz from public.app_settings where key = p_key), p_default);
$$;

revoke execute on function public._get_app_setting_timestamptz(text, timestamptz) from public;
revoke execute on function public._get_app_setting_timestamptz(text, timestamptz) from authenticated;

-- ----------------------------------------------------------------------------
-- compute_ride_fare() — redefined once more. Everything above the surge
-- block (distance sanity check, pricing_rules lookup) is UNCHANGED from
-- 20260831110000. Only the final assignment block changes: instead of
-- writing v_rule.base_fare/distance_fare straight onto NEW, it computes
-- the effective multiplier first and scales both by it.
-- ----------------------------------------------------------------------------
create or replace function public.compute_ride_fare()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rule public.pricing_rules;
  v_straight_line_km numeric;
  v_raw_base numeric;
  v_raw_distance numeric;
  v_surge_enabled boolean;
  v_surge_starts timestamptz;
  v_surge_ends timestamptz;
  v_surge_max numeric;
  v_effective_multiplier numeric := 1.00;
begin
  if new.distance_km is null then
    raise exception 'distance_km is required to compute fare' using errcode = '23514';
  end if;

  v_straight_line_km := ST_Distance(new.pickup_location, new.drop_location) / 1000.0;
  if new.distance_km < v_straight_line_km - 0.1 then
    raise exception 'distance_km (%) is implausibly short for this pickup/drop pair (straight-line distance is %km)',
      new.distance_km, round(v_straight_line_km::numeric, 2)
      using errcode = '23514';
  end if;

  select *
  into v_rule
  from public.pricing_rules
  where vehicle_type = new.vehicle_type
    and is_active = true
    and deleted_at is null
    and effective_from <= now()
    and (effective_to is null or effective_to > now())
    and (city_id is null or city_id = new.city_id)
  order by (city_id is null) asc
  limit 1;

  if v_rule.id is null then
    raise exception 'No active pricing rule for vehicle type %', new.vehicle_type using errcode = 'P0002';
  end if;

  v_raw_base := v_rule.base_fare;
  v_raw_distance := round(v_rule.per_km_rate * new.distance_km);

  -- Surge: only ever computed here, at ride-creation time, from
  -- admin-configured server state — never from anything the client sent.
  v_surge_enabled := public._get_app_setting_bool('surge_enabled', false);
  if v_surge_enabled then
    v_surge_starts := public._get_app_setting_timestamptz('surge_starts_at', null);
    v_surge_ends := public._get_app_setting_timestamptz('surge_ends_at', null);

    -- No schedule set (either bound null) => manual on/off only, surge
    -- applies whenever surge_enabled is true. Both bounds set => surge
    -- only applies inside that window; automatically stops the instant
    -- now() passes surge_ends_at, no separate expiry job required.
    if (v_surge_starts is null or now() >= v_surge_starts)
       and (v_surge_ends is null or now() <= v_surge_ends) then
      v_surge_max := public._get_app_setting_numeric('surge_max_multiplier', 2.00);
      -- Precedence: the vehicle's own configured multiplier, capped by
      -- the admin's global max AND by the absolute hard ceiling — see
      -- this migration's header comment for the full documented rule.
      v_effective_multiplier := least(greatest(v_rule.surge_multiplier, 1.00), v_surge_max, 5.00);
    end if;
  end if;

  new.base_fare := round(v_raw_base * v_effective_multiplier, 2);
  new.distance_fare := round(v_raw_distance * v_effective_multiplier, 2);
  new.discount_amount := coalesce(new.discount_amount, 0);
  new.total_fare := new.base_fare + new.distance_fare - new.discount_amount;
  new.surge_multiplier := v_effective_multiplier;

  return new;
end;
$$;

drop trigger if exists compute_ride_fare on public.rides;
create trigger compute_ride_fare
  before insert on public.rides
  for each row execute function public.compute_ride_fare();

revoke all on function public.compute_ride_fare() from public;

comment on function public.compute_ride_fare() is
  'Server-authoritative fare calculation, now including surge — recomputes base_fare/distance_fare/total_fare/surge_multiplier from the active pricing_rules row and current surge configuration, discarding whatever the client sent. See this migration''s header for the exact documented formula and precedence rule.';

-- ----------------------------------------------------------------------------
-- Surge status — a single computed read, reused by the Admin UI (and any
-- future passenger/driver transparency UI) instead of each caller
-- re-implementing "is surge actually in effect right now" from the raw
-- settings. Read-only, authenticated (not admin-only — passengers/drivers
-- may legitimately want to know surge is active before booking, same
-- read-visibility level as pricing_rules_select_authenticated).
-- ----------------------------------------------------------------------------
create or replace function public.get_surge_status()
returns table (
  surge_enabled boolean,
  surge_currently_active boolean,
  surge_max_multiplier numeric,
  surge_starts_at timestamptz,
  surge_ends_at timestamptz,
  vehicle_type public.vehicle_type_enum,
  vehicle_multiplier numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_enabled boolean;
  v_starts timestamptz;
  v_ends timestamptz;
  v_in_window boolean;
begin
  if auth.role() is distinct from 'authenticated' then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  v_enabled := public._get_app_setting_bool('surge_enabled', false);
  v_starts := public._get_app_setting_timestamptz('surge_starts_at', null);
  v_ends := public._get_app_setting_timestamptz('surge_ends_at', null);
  v_in_window := (v_starts is null or now() >= v_starts) and (v_ends is null or now() <= v_ends);

  return query
  select
    v_enabled,
    v_enabled and v_in_window,
    public._get_app_setting_numeric('surge_max_multiplier', 2.00),
    v_starts,
    v_ends,
    pr.vehicle_type,
    case when v_enabled and v_in_window
      then least(greatest(pr.surge_multiplier, 1.00), public._get_app_setting_numeric('surge_max_multiplier', 2.00), 5.00)
      else 1.00
    end
  from public.pricing_rules pr
  where pr.city_id is null and pr.is_active = true;
end;
$$;

revoke execute on function public.get_surge_status() from public;
grant execute on function public.get_surge_status() to authenticated;

comment on function public.get_surge_status() is 'Read-only computed surge status per vehicle type — the SAME effective-multiplier logic compute_ride_fare() uses internally, exposed for display so no caller re-implements it. Authenticated (not admin-only): passengers/drivers may legitimately see this before booking.';

-- ----------------------------------------------------------------------------
-- Surge recommendation — rule-based only, NEVER auto-applied. Reuses the
-- exact demand/supply concepts already established in
-- admin_live_ops_snapshot() (20260830090000): open ride requests as
-- demand, online+approved+not-currently-busy drivers as supply — broken
-- down per vehicle type here, since surge itself is per-vehicle. Admin
-- reads this and decides whether to manually set a vehicle's
-- surge_multiplier; nothing here writes to pricing_rules or app_settings.
-- ----------------------------------------------------------------------------
create or replace function public.admin_surge_recommendation()
returns table (
  vehicle_type public.vehicle_type_enum,
  open_requests integer,
  available_drivers integer,
  demand_supply_ratio numeric,
  suggested_multiplier numeric,
  recommendation text
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
  with demand as (
    select r.vehicle_type, count(*)::integer as open_requests
    from public.rides r
    where r.status in ('requested', 'matched')
    group by r.vehicle_type
  ),
  supply as (
    select d.vehicle_type, count(*)::integer as available_drivers
    from public.drivers d
    where d.is_online = true
      and d.verification_status = 'approved'
      and not exists (
        select 1 from public.rides r
        where r.driver_id = d.id and r.status in ('accepted', 'driver_arriving', 'ride_started')
      )
    group by d.vehicle_type
  ),
  types as (
    select unnest(enum_range(null::public.vehicle_type_enum)) as vehicle_type
  ),
  computed as (
    select
      t.vehicle_type,
      coalesce(dm.open_requests, 0) as open_requests,
      coalesce(sp.available_drivers, 0) as available_drivers,
      case
        when coalesce(sp.available_drivers, 0) > 0
          then round(coalesce(dm.open_requests, 0)::numeric / sp.available_drivers, 2)
        when coalesce(dm.open_requests, 0) > 0
          then null -- demand with literally zero available drivers — ratio is undefined, not infinite
        else 0::numeric
      end as ratio
    from types t
    left join demand dm on dm.vehicle_type = t.vehicle_type
    left join supply sp on sp.vehicle_type = t.vehicle_type
  )
  select
    c.vehicle_type,
    c.open_requests,
    c.available_drivers,
    c.ratio,
    -- Simple, explainable, rule-based tiers — not ML, not automatically
    -- applied. Capped at the current admin-configured max so a suggestion
    -- is never shown that the system wouldn't actually be allowed to
    -- apply anyway.
    least(
      case
        when c.ratio is null then public._get_app_setting_numeric('surge_max_multiplier', 2.00)
        when c.ratio >= 3.0 then 1.50
        when c.ratio >= 2.0 then 1.30
        when c.ratio >= 1.5 then 1.15
        else 1.00
      end,
      public._get_app_setting_numeric('surge_max_multiplier', 2.00),
      5.00
    ),
    case
      when c.open_requests = 0 then 'No open demand for this vehicle type right now.'
      when c.ratio is null then 'High demand detected with zero available drivers — suggested surge at the configured maximum.'
      when c.ratio >= 3.0 then format('High demand detected (%s requests, %s drivers) — suggested surge 1.40x-1.50x.', c.open_requests, c.available_drivers)
      when c.ratio >= 2.0 then format('Elevated demand (%s requests, %s drivers) — suggested surge ~1.30x.', c.open_requests, c.available_drivers)
      when c.ratio >= 1.5 then format('Slightly elevated demand (%s requests, %s drivers) — suggested surge ~1.15x.', c.open_requests, c.available_drivers)
      else 'Demand and supply are balanced — no surge suggested.'
    end
  from computed c
  order by c.vehicle_type;
end;
$$;

revoke all on function public.admin_surge_recommendation() from public;
grant execute on function public.admin_surge_recommendation() to authenticated;

comment on function public.admin_surge_recommendation() is 'Read-only, rule-based surge SUGGESTION per vehicle type from current open-request/available-driver counts — never writes anything, never auto-applies. Admin reads this and, if they agree, manually sets that vehicle''s pricing_rules.surge_multiplier via the normal admin pricing update path.';
