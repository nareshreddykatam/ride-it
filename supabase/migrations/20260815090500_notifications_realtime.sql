-- ============================================================================
-- 20260815090500_notifications_realtime.sql
-- Phase 10. Adds `notifications` to the supabase_realtime publication so
-- the unread badge/notification center can update live rather than only
-- on next page load — the same "add the table, RLS still scopes who
-- receives what" pattern as Phase 8/9's additions of rides/ride_offers/
-- drivers. notifications_select_own (Phase 3, unchanged) means a
-- subscriber filtered to their own user_id only ever receives their own
-- notifications.
-- ============================================================================

alter publication supabase_realtime add table public.notifications;
