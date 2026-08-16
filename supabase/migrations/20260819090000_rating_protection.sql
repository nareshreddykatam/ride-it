-- ============================================================================
-- 20260819090000_rating_protection.sql
-- Phase 15. Two real, previously-unflagged gaps found by reading the
-- existing RLS/trigger architecture against this phase's explicit
-- requirements — the same way every phase since 8 has found its own.
--
-- 1. passengers.rating/total_rides have NEVER been protected by any
--    trigger. Phase 6.2 built protect_driver_system_columns specifically
--    for the driver side of this exact problem (a driver directly
--    setting their own rating via the broad drivers_update_own-style
--    RLS); passengers.rating sat there with the identical exposure the
--    entire time, via the equally broad passengers_update_own policy
--    (Phase 3: `using (id = auth.uid())`, no column restriction).
--
-- 2. rides.passenger_rating/driver_rating (the denormalized read-shortcut
--    columns documented since Phase 3's own schema comment) were never
--    protected either — directly writable via rides_update_passenger/
--    rides_update_driver's same broad row-level-only RLS Phase 11 already
--    found and partially fixed for financial columns, but ratings were
--    never added to that protected set.
-- ============================================================================

create or replace function public.protect_passenger_system_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('ride_it.trusted_write', true), 'false') = 'true'
     or public.is_admin() then
    return new;
  end if;

  if new.rating is distinct from old.rating
     or new.total_rides is distinct from old.total_rides
  then
    raise exception 'Cannot modify protected passenger fields directly' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_passenger_system_columns on public.passengers;
create trigger protect_passenger_system_columns
  before update on public.passengers
  for each row execute function public.protect_passenger_system_columns();

comment on function public.protect_passenger_system_columns() is 'Mirrors protect_driver_system_columns (Phase 6.2) for the passenger side — blocks direct passenger self-modification of rating/total_rides, regardless of write path. default_payment_method and home_city_id remain passenger-editable.';

create or replace function public.protect_ride_rating_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('ride_it.trusted_write', true), 'false') = 'true'
     or public.is_admin() then
    return new;
  end if;

  if new.passenger_rating is distinct from old.passenger_rating
     or new.driver_rating is distinct from old.driver_rating
  then
    raise exception 'Cannot modify ride rating fields directly' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_ride_rating_columns on public.rides;
create trigger protect_ride_rating_columns
  before update on public.rides
  for each row execute function public.protect_ride_rating_columns();

comment on function public.protect_ride_rating_columns() is 'Blocks direct passenger/driver modification of the denormalized passenger_rating/driver_rating shortcut columns — a separate trigger from protect_ride_financial_columns (Phase 11) because these are not financial fields; only submit_rating() (this phase) may set them, via _mark_trusted_write().';
