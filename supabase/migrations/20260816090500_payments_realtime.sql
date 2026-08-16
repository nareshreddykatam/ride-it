-- ============================================================================
-- 20260816090500_payments_realtime.sql
-- Phase 11. Adds `payments` to the supabase_realtime publication so the
-- Passenger checkout screen can react live to a webhook-driven status
-- change (e.g. a delayed webhook capturing the payment after the
-- browser's own /verify call already returned) without polling. RLS
-- (payments_select_own_passenger, this phase) scopes what each
-- subscriber actually receives — same pattern as every Realtime addition
-- since Phase 8.
-- ============================================================================

alter publication supabase_realtime add table public.payments;
