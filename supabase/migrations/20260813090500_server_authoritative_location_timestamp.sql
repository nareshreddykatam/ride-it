-- ============================================================================
-- 20260813090500_server_authoritative_location_timestamp.sql
-- Phase 8. Makes drivers.location_updated_at genuinely server-authoritative:
-- a client can update current_location, but never location_updated_at
-- directly — this trigger sets it to now() whenever current_location
-- actually changes, and leaves it untouched otherwise (e.g. a driver
-- toggling is_online doesn't bump their location freshness for free).
--
-- Without this, the matching engine's freshness filter
-- (driver_location_freshness_seconds) would only be as trustworthy as
-- whatever timestamp a client chose to send — which defeats the point of
-- a freshness check at all.
-- ============================================================================

create or replace function public.set_driver_location_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.current_location is distinct from old.current_location then
    new.location_updated_at = now();
  else
    new.location_updated_at = old.location_updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists set_driver_location_timestamp on public.drivers;
create trigger set_driver_location_timestamp
  before update on public.drivers
  for each row execute function public.set_driver_location_timestamp();

comment on function public.set_driver_location_timestamp() is
  'Sets location_updated_at = now() only when current_location actually changes, and ignores any client-supplied value for the column entirely — makes the matching engine''s staleness check meaningful.';
