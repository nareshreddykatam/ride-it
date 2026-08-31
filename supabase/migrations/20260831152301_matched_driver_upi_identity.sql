-- ============================================================================
-- 20260831152301_matched_driver_upi_identity.sql
--
-- CORRECTION to the prior task's driver-QR feature: that work displayed a
-- driver-UPLOADED QR IMAGE (drivers.upi_qr_path, admin-approved via
-- upi_qr_status) — requiring the driver to separately photograph/upload a
-- QR before the passenger could ever see one, which is why the passenger
-- UI showed "This driver hasn't set up a verified UPI QR code yet" for
-- any driver who registered a real UPI ID but never went through that
-- separate upload+approval flow. Live UI testing confirmed this doesn't
-- satisfy the actual requirement: RideIT must GENERATE a QR from the
-- driver's registered UPI ID directly — no image upload required.
--
-- get_matched_driver_qr_path() (20260831075523) is superseded and
-- removed — nothing else calls it (confirmed via repo-wide grep before
-- writing this migration). The driver-payment-qr Storage bucket and
-- upload flow (payment-settings page) are UNTOUCHED — a driver can still
-- optionally upload a QR image for their own reference; it's simply no
-- longer the thing generated for passengers to scan.
--
-- get_matched_driver_upi() returns the identity inputs (upi_id, the
-- driver's display name, whether they currently accept this method) —
-- never a QR image itself. Both apps build the actual UPI URI and render
-- the QR client-side (packages/payments/src/upi.ts) from these
-- authoritative values plus rides.total_fare, which this function does
-- NOT return — callers already have it from their own getRide() read,
-- keeping this function narrowly scoped to identity only.
--
-- Deliberately does NOT gate on upi_verified — per this task's explicit
-- instruction, UPI ID validity and payment verification are different
-- concepts; an unverified UPI ID is still a legitimate one to generate a
-- QR from (the payment itself remains "pending" regardless, exactly like
-- the online path already works). accepts_driver_upi IS still respected
-- — that is the driver's own choice to offer this method at all, not a
-- verification gate.
-- ============================================================================

drop function if exists public.get_matched_driver_qr_path(uuid);

create or replace function public.get_matched_driver_upi(p_ride_id uuid)
returns table (upi_id text, driver_name text, accepts_driver_upi boolean)
language sql
stable
security definer
set search_path = public
as $$
  select d.upi_id, u.full_name, d.accepts_driver_upi
  from public.rides r
  join public.drivers d on d.id = r.driver_id
  join public.users u on u.id = r.driver_id
  where r.id = p_ride_id
    and r.passenger_id = auth.uid()
    and r.driver_id is not null
    and r.payment_method = 'driver_upi'
    and r.status in ('ride_completed', 'payment', 'rated');
$$;

revoke all on function public.get_matched_driver_upi(uuid) from public;
grant execute on function public.get_matched_driver_upi(uuid) to authenticated;

comment on function public.get_matched_driver_upi(uuid) is
  'Returns the matched driver''s registered UPI id + display name for the calling passenger''s own ride, once that ride has reached a fare-final status and the passenger selected driver_upi as the payment method. Null row in every other case (wrong passenger, no driver, wrong payment method, ride not yet finished). Callers combine this with their own already-authoritative rides.total_fare read to build the UPI payment URI and render a QR client-side — this function never returns a QR image or amount itself.';
