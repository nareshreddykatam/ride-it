-- ============================================================================
-- 20260831160000_matched_driver_qr_access.sql
--
-- PART 7 — Post-ride driver QR payment display.
--
-- Existing infrastructure this reuses, unchanged: drivers.upi_qr_path
-- (private Storage path in the driver-payment-qr bucket, admin-verified
-- via upi_qr_status), drivers.accepts_driver_upi, rides.payment_method /
-- total_fare (server-authoritative, computed once at ride creation by
-- compute_ride_fare() and never recomputed). No QR-generation library is
-- introduced — there is nothing to generate: the driver already uploaded
-- their own real UPI QR image for admin verification (payment-settings
-- page). This migration only adds secure DISPLAY of that already-verified
-- image to the ONE passenger on the ONE completed ride that actually owes
-- that driver money, modeled directly on get_matched_driver_selfie_path()
-- (20260827090000) — same shape, same reasoning, different bucket/scope.
--
-- Storage RLS on driver-payment-qr (20260821090200) only grants SELECT to
-- the owning driver's own folder and admins — a passenger has no existing
-- read path to it. This RPC resolves the path server-side (never a
-- client-supplied path or driver id); the passenger app's driver-qr route
-- handler then mints a short-lived signed URL with the service-role
-- client, exactly like driver-selfie's route.
--
-- Scoped to AFTER the ride has actually reached a fare-final state
-- (ride_completed/payment/rated) — this is deliberately a POST-ride
-- payment QR, not shown before the final fare is settled. Also requires
-- payment_method = 'driver_upi' (the passenger must have actually chosen
-- this method) and upi_qr_status = 'approved' (an unverified/rejected QR
-- is never shown to a passenger as something to pay).
-- ============================================================================

create or replace function public.get_matched_driver_qr_path(p_ride_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select d.upi_qr_path
  from public.rides r
  join public.drivers d on d.id = r.driver_id
  where r.id = p_ride_id
    and r.passenger_id = auth.uid()
    and r.driver_id is not null
    and r.payment_method = 'driver_upi'
    and r.status in ('ride_completed', 'payment', 'rated')
    and d.accepts_driver_upi = true
    and d.upi_qr_status = 'approved'
    and d.upi_qr_path is not null;
$$;

revoke all on function public.get_matched_driver_qr_path(uuid) from public;
grant execute on function public.get_matched_driver_qr_path(uuid) to authenticated;

comment on function public.get_matched_driver_qr_path(uuid) is
  'Returns the Storage object path (not a URL) of the matched driver''s admin-approved UPI QR code, for the calling passenger''s own ride only, once that ride has reached a fare-final status (ride_completed/payment/rated) and the passenger selected driver_upi as the payment method. Null in every other case (wrong passenger, no driver, wrong payment method, unapproved QR, ride not yet finished). Callers must mint a short-lived signed URL server-side (service-role client) from this path — never return this path itself to any client.';
