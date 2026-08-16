-- ============================================================================
-- 20260813090400_enable_realtime.sql
-- Phase 8. Adds `rides` and `ride_offers` to the supabase_realtime
-- publication — without this, postgres_changes subscriptions receive
-- nothing at all, regardless of RLS. RLS is what scopes *which* rows a
-- given subscribed client actually receives (Supabase Realtime evaluates
-- SELECT policies per-subscriber for postgres_changes) — this migration
-- only makes the tables broadcast-eligible in the first place.
--
-- Not added: every other table. Only the two tables Phase 8's realtime
-- requirements actually need (passenger/admin watch `rides`, drivers watch
-- their own `ride_offers`) are added — not a blanket "replicate
-- everything," which would be unnecessary replication overhead for tables
-- nothing subscribes to.
-- ============================================================================

alter publication supabase_realtime add table public.rides;
alter publication supabase_realtime add table public.ride_offers;
