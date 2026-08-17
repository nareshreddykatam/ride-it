-- ============================================================================
-- 20260822090300_increase_matching_search_duration.sql
--
-- Part 16 — the passenger's total driver-search window was too short.
--
-- BEFORE: matching_max_batches = 5, matching_offer_window_seconds = 15.
-- Worst case a batch actually reaches a driver who never responds, the
-- engine waits out the full offer window before trying the next batch —
-- so total worst-case search time was 5 x 15s = 75s. In practice it was
-- often much shorter: dispatch_next_batch() advances immediately (no 15s
-- wait) whenever a batch finds zero eligible drivers, so a ride with few
-- eligible drivers nearby could exhaust all 5 batches and give up in well
-- under a minute.
--
-- AFTER: matching_max_batches = 6, matching_offer_window_seconds
-- unchanged at 15. Worst case (every batch actually reaches a driver) is
-- now 6 x 15s = 90s — the top of the requested 60-90s range — while a
-- ride with genuinely zero eligible drivers still fails fast (empty
-- batches never wait out the window), and the "stop immediately once a
-- driver accepts" behavior is unchanged (advance_ride_matching only ever
-- runs while ride.status is 'requested'/'matched' — accepted or
-- cancelled ends the heartbeat's work immediately, per its own guard).
--
-- This is a pure app_settings data change — no function, RLS, or
-- eligibility-rule change. The individual offer window (Part 17: "do not
-- weaken existing rules") and the one-offer-per-driver-per-ride rule in
-- _find_eligible_drivers are both completely untouched.
-- ============================================================================

update public.app_settings
set value = '6', description = 'Maximum number of dispatch batches attempted before a ride is marked as having no available drivers. Raised from 5 to 6 (Part 16) so the passenger''s total worst-case search time is ~90s (6 x 15s offer window) instead of ~75s, while the per-offer window stays 15s.'
where key = 'matching_max_batches';
