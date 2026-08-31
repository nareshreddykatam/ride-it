-- ============================================================================
-- 20260831132357_protect_completed_ride_driver_id.sql
--
-- GAP FOUND during this task's Part 6/16 financial-integrity audit (not
-- introduced by any prior task — pre-existing since rides_update_passenger
-- was created): protect_ride_financial_columns() guards payment_status/
-- base_fare/distance_fare/total_fare/discount_amount from direct client
-- writes, but NOT driver_id. rides_update_passenger's RLS policy lets the
-- owning passenger UPDATE their own ride while status is in
-- ('requested','matched','accepted','driver_arriving','ride_completed',
-- 'payment','rated') — including every fare-final state — with no column
-- restriction and no protecting trigger on driver_id specifically. A
-- passenger could therefore issue a plain PostgREST PATCH re-pointing
-- their own COMPLETED ride's driver_id at an unrelated driver, which
-- get_matched_driver_qr_path() (20260831075523) and
-- get_matched_driver_contact()/get_matched_driver_selfie_path() all trust
-- via `join drivers d on d.id = r.driver_id` — surfacing that unrelated
-- driver's UPI QR / contact / selfie as if they belonged to the ride.
--
-- (The driver-side QR display added in the payment-fare task is NOT
-- affected by this gap — apps/driver's navigation/page.tsx always reads
-- getDriverProfile(supabase, user.id), the CALLING driver's own
-- auth.uid(), never ride.driver_id. Only the passenger-facing lookups
-- that trust the row's driver_id column are exposed.)
--
-- FIX, scoped narrowly to avoid touching any in-flight matching/
-- cancellation behavior: block driver_id changes only once the ride has
-- reached a fare-final state (status in ride_completed/payment/rated) or
-- payment_status is already 'paid' — the exact window where a driver_id
-- change could misdirect a payment identity. Every LEGITIMATE function
-- that sets driver_id (accept_ride_offer: status='matched' -> 'accepted';
-- cancel_ride_by_driver: status in accepted/driver_arriving -> 'requested',
-- clearing it) only ever runs well before those states, so neither needs
-- (or gets) a _mark_trusted_write() call added — this trigger simply
-- never fires for their writes. Admin reassignment (rides_all_admin RLS,
-- is_admin()) remains exempt, same as the existing financial-columns
-- guard.
-- ============================================================================

create or replace function public.protect_ride_financial_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
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

  if new.driver_id is distinct from old.driver_id
     and (old.status in ('ride_completed', 'payment', 'rated') or old.payment_status = 'paid')
  then
    raise exception 'Cannot reassign the driver on a fare-final ride directly' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.protect_ride_financial_columns() is
  'Blocks direct (non-trusted-write, non-admin) client writes to payment_status/base_fare/distance_fare/total_fare/discount_amount at all times, and to driver_id specifically once the ride is fare-final (ride_completed/payment/rated) or already paid — the window where a driver_id change could misdirect who a payment identity (UPI QR, contact info) resolves to. Legitimate driver_id writers (accept_ride_offer, cancel_ride_by_driver) only ever act on non-terminal rides and are unaffected; admin reassignment remains exempt via is_admin().';
