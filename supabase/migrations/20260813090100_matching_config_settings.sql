-- ============================================================================
-- 20260813090100_matching_config_settings.sql
-- Phase 8. Centralizes every matching-related tunable in app_settings
-- rather than hardcoding them inside SQL functions or scattering them
-- across the codebase. A get_matching_setting_int() helper (next
-- migration) reads these at call time, so changing a value later is a
-- data update, not a code/migration change.
--
-- matching_offer_window_seconds matches the Driver app's existing
-- RideRequestSheet OFFER_WINDOW_SECONDS constant (15) exactly — the UI's
-- countdown and the server's actual expiry now agree by construction, not
-- by coincidence.
-- ============================================================================

insert into public.app_settings (key, value, description) values
  ('matching_offer_window_seconds', '15', 'How long a driver has to respond to a ride offer before it expires. Matches the Driver app''s existing countdown UI.'),
  ('matching_batch_size', '3', 'How many nearest eligible drivers are offered a ride simultaneously per dispatch batch.'),
  ('driver_location_freshness_seconds', '120', 'A driver''s current_location is only trusted for matching if location_updated_at is within this many seconds — older locations are treated as stale and that driver is excluded.'),
  ('matching_max_batches', '5', 'Maximum number of dispatch batches attempted before a ride is marked as having no available drivers.')
on conflict (key) do nothing;
