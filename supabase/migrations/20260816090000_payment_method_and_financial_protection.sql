-- ============================================================================
-- 20260816090000_payment_method_and_financial_protection.sql
-- Phase 11. Two independent things bundled because they're both
-- foundational to everything else in this phase:
--
-- 1. payment_method_enum only ever had ('cash', 'upi') — 'upi' was
--    ambiguous between "driver's own UPI" and a future "online payment"
--    concept (flagged explicitly as a gap in the Phase 7 review). Renamed
--    to 'driver_upi' (clearer, matches the product model) and 'online'
--    added as a real third value.
--
-- 2. REAL VULNERABILITY FOUND, not introduced this phase: rides_update_passenger
--    (Phase 3) is `using (passenger_id = auth.uid() and status in (...))
--    with check (passenger_id = auth.uid())` — row-level only, exactly
--    like every other RLS policy in this schema. Nothing has ever stopped
--    an authenticated passenger from directly calling
--    `supabase.from('rides').update({payment_status: 'paid'})` on their
--    own ride, or rewriting base_fare/distance_fare/total_fare
--    consistently (the existing rides_total_fare_matches_components CHECK
--    only enforces internal consistency between those three columns, not
--    that they can't ALL be rewritten together, e.g. to near-zero). This
--    is precisely what this phase's brief means by "client-side payment
--    status spoofing" and "amount manipulation" — found by reading the
--    existing policy carefully against this phase's explicit
--    requirements, the same way Phase 8/10 found their respective gaps.
-- ============================================================================

alter type public.payment_method_enum rename value 'upi' to 'driver_upi';
alter type public.payment_method_enum add value 'online';

alter table public.drivers add column upi_id text;
alter table public.drivers add column upi_verified boolean not null default false;
alter table public.drivers add column upi_verified_at timestamptz;

comment on column public.drivers.upi_id is 'Driver''s own registered UPI identity for the driver_upi ride payment method. Driver-editable. Changing it resets upi_verified to false (see reset_upi_verification_on_change trigger).';
comment on column public.drivers.upi_verified is 'Admin-only — protected by protect_driver_system_columns (extended below). A driver can never self-verify.';

create or replace function public.reset_upi_verification_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.upi_id is distinct from old.upi_id then
    new.upi_verified := false;
    new.upi_verified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reset_upi_verification_on_change on public.drivers;
create trigger reset_upi_verification_on_change
  before update on public.drivers
  for each row execute function public.reset_upi_verification_on_change();

create or replace function public.protect_driver_system_columns()
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

  if new.verification_status is distinct from old.verification_status
     or new.rating is distinct from old.rating
     or new.strike_count is distinct from old.strike_count
     or new.total_rides is distinct from old.total_rides
     or new.verification_notes is distinct from old.verification_notes
     or new.upi_verified is distinct from old.upi_verified
     or new.upi_verified_at is distinct from old.upi_verified_at
  then
    raise exception 'Cannot modify protected driver fields directly' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.protect_driver_system_columns() is 'Blocks direct driver self-modification of verification_status/rating/strike_count/total_rides/verification_notes/upi_verified/upi_verified_at, regardless of write path. Phase 11 added the UPI verification fields to the protected set.';

create or replace function public.protect_ride_financial_columns()
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

  if new.payment_status is distinct from old.payment_status
     or new.base_fare is distinct from old.base_fare
     or new.distance_fare is distinct from old.distance_fare
     or new.total_fare is distinct from old.total_fare
     or new.discount_amount is distinct from old.discount_amount
  then
    raise exception 'Cannot modify ride financial fields directly' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_ride_financial_columns on public.rides;
create trigger protect_ride_financial_columns
  before update on public.rides
  for each row execute function public.protect_ride_financial_columns();

comment on function public.protect_ride_financial_columns() is 'Blocks direct passenger/driver modification of payment_status and every fare column — closes a real gap where rides_update_passenger''s broad row-level RLS would otherwise let a passenger mark their own ride paid, or rewrite the fare, via a direct client UPDATE. payment_method is intentionally NOT protected — selecting a payment method is a normal passenger action.';
