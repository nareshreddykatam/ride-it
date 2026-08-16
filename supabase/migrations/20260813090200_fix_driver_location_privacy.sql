-- ============================================================================
-- 20260813090200_fix_driver_location_privacy.sql
-- Phase 8, Location Privacy requirement.
--
-- Vulnerability (pre-existing, not introduced this phase): drivers_select_online
-- (Phase 3) was `using (is_online = true and verification_status = 'approved')`
-- — this let ANY authenticated user (passenger or driver) SELECT the full
-- row, including current_location, of EVERY online approved driver,
-- unconditionally, anywhere in the system. Phase 3's own comment on this
-- policy already flagged it as provisional ("intentionally broad... a view
-- exposing only non-sensitive columns is the recommended follow-up if
-- column-level restriction becomes necessary"). It is now necessary — this
-- is exactly the "broad location-read policy" this phase's brief prohibits.
--
-- Confirmed unused: no application code (Passenger, Driver, or Admin)
-- currently queries drivers filtered only by is_online — grep across the
-- whole repo before this migration found zero call sites relying on it.
-- Nothing loses functionality by removing it.
--
-- Post-assignment driver visibility is unaffected — drivers_select_active_ride_passenger
-- (Phase 3) already correctly scopes a passenger to only the driver
-- assigned to THEIR OWN active ride, which is the only case this project
-- actually needs. Pre-assignment, the passenger doesn't need any driver's
-- location at all (they see "searching..." then a realtime assignment,
-- not a live map of nearby drivers — no maps integration this phase).
-- ============================================================================

drop policy if exists "drivers_select_online" on public.drivers;

comment on table public.drivers is 'Driver-specific profile fields. 1:1 extension of users. current_location is a PostGIS geography point kept fresh by the app on each location ping. Location visibility is intentionally narrow: self (drivers_select_own), admin (drivers_all_admin), or the passenger of an active assigned ride (drivers_select_active_ride_passenger) — there is no broad "any online driver" read policy (removed Phase 8; see migration 20260813090200).';
