-- ============================================================================
-- 20260818090400_safety_realtime.sql
-- Phase 13. Adds `safety_events` to the supabase_realtime publication so
-- Admin's Safety dashboard can auto-refresh when a new SOS is triggered
-- — the same pattern as Admin's Live Rides list (Phase 8,
-- subscribeToAllRideChanges). RLS (safety_events_all_admin /
-- safety_events_select_own, this phase) scopes what each subscriber
-- actually receives, same as every Realtime addition since Phase 8.
-- The urgent alerting itself already exists independently via the
-- notifications table (realtime since Phase 10) — this is additionally
-- for the dashboard LIST to stay current, not the primary alert path.
-- ============================================================================

alter publication supabase_realtime add table public.safety_events;
