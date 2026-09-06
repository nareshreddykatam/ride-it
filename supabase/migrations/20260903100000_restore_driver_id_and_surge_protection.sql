-- ============================================================================
-- 20260903100000_restore_driver_id_and_surge_protection.sql
--
-- REGRESSION FOUND during this task's production-readiness audit:
-- 20260831132357_protect_completed_ride_driver_id.sql added a driver_id
-- guard to protect_ride_financial_columns() (blocking a passenger from
-- re-pointing a fare-final ride's driver_id via a raw PostgREST PATCH,
-- which get_matched_driver_upi() and related lookups trust). The very
-- next redefinition of this function, in
-- 20260902100100_ride_completion_flow_rpcs.sql (added to layer in the new
-- payment_method guard), was written as `create or replace function ...`
-- starting from an older copy of the function body that predated the
-- driver_id branch — silently dropping it. No migration since has
-- restored it (verified: no other migration references driver_id inside
-- this trigger). Net effect: a passenger can currently PATCH their own
-- completed/paid ride's driver_id to an arbitrary driver id, and
-- get_matched_driver_upi() would then legitimately (from the DB's point
-- of view) resolve and return that unrelated driver's real UPI id.
--
-- SEPARATE GAP FOUND in the same audit: rides.surge_multiplier has never
-- been included in this guard's column list, in any of its three
-- revisions (20260816090000, 20260831132357, 20260902100100 — grepped,
-- zero matches for surge_multiplier in any of them). base_fare/
-- distance_fare/total_fare are protected, but surge_multiplier — the
-- other server-computed value from the same calculation, snapshotted at
-- ride creation per 20260831130000's own comment ("set once by
-- compute_ride_fare(), never recomputed") — is not. Combined with
-- rides_update_passenger/rides_update_driver's broad RLS (no column
-- restriction), either party can currently PATCH surge_multiplier on
-- their own ride at any time, including after completion, falsifying the
-- surge breakdown both apps render on the ride-complete screen. This
-- cannot change what's actually charged (total_fare stays protected) but
-- breaks the documented "immutable historical snapshot" guarantee.
--
-- FIX: re-create protect_ride_financial_columns() with the full,
-- combined guard list — everything 20260902100100 already protects,
-- PLUS driver_id (restored, identical condition/logic to
-- 20260831132357) PLUS surge_multiplier (new, guarded unconditionally
-- like the other fare columns). No RLS policy, trigger call site, table
-- structure, or historical data is touched — this only widens what the
-- existing trigger function itself blocks.
-- ============================================================================

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
     or new.payment_method is distinct from old.payment_method
     or new.base_fare is distinct from old.base_fare
     or new.distance_fare is distinct from old.distance_fare
     or new.total_fare is distinct from old.total_fare
     or new.discount_amount is distinct from old.discount_amount
     or new.surge_multiplier is distinct from old.surge_multiplier
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
  'Blocks direct (non-trusted-write, non-admin) client writes to payment_status/payment_method/base_fare/distance_fare/total_fare/discount_amount/surge_multiplier at all times, and to driver_id specifically once the ride is fare-final (ride_completed/payment/rated) or already paid. Restores the driver_id guard dropped by 20260902100100''s redefinition and adds surge_multiplier, which was never guarded. payment_method remains writable only via driver_select_payment_method()/passenger_select_online_payment_method(), both trusted writes; legitimate driver_id writers (accept_ride_offer, cancel_ride_by_driver) only ever act on non-terminal rides and are unaffected; admin reassignment remains exempt via is_admin().';
