-- ============================================================================
-- 20260806090100_ride_acceptance_rls.sql
-- Phase 6 fix, found while implementing ride acceptance (same category of
-- issue as the Phase 4.5 validation pass — a genuine gap, not a redesign).
--
-- Phase 3's rides_update_driver policy is:
--   for update using (driver_id = auth.uid())
-- That only permits updating a ride ALREADY assigned to this driver. It
-- says nothing about the moment of *becoming* assigned — accepting a ride
-- means driver_id transitions from NULL to auth.uid(), so the USING clause
-- (evaluated against the row's current state) was never satisfied and every
-- accept attempt would have been silently rejected by RLS.
-- ============================================================================

create policy "rides_accept_unassigned_by_driver" on public.rides
  for update
  using (driver_id is null and status = 'requested')
  with check (driver_id = auth.uid() and status = 'accepted');

comment on policy "rides_accept_unassigned_by_driver" on public.rides is
  'Permits a driver to claim an unassigned requested ride (driver_id null -> self, status requested -> accepted) in one atomic UPDATE. Distinct from rides_update_driver, which only covers rides already assigned to the calling driver.';
