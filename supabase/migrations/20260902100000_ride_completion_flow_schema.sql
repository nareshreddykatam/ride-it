-- ============================================================================
-- 20260902100000_ride_completion_flow_schema.sql
--
-- New Part: driver-controlled end-of-ride flow (arrival -> payment
-- collection -> payment received -> completion), replacing the previous
-- "driver taps one Complete button, passenger confirms payment afterward"
-- model with an explicit, driver-confirmed sequence, per product decision.
--
-- Schema-only migration (enum values + one column). Kept in its own file,
-- separate from the RPCs/triggers that reference these new values, because
-- PostgreSQL cannot use a newly-added enum value in the same transaction
-- that added it (ALTER TYPE ... ADD VALUE is not transactional in that
-- sense) — this is the standard, safe two-migration pattern for enum
-- additions, not an oversight.
--
-- STATE MACHINE DECISION: two new ride_status_enum values are added,
-- 'destination_reached' and 'payment_collected', inserted between the
-- existing 'ride_started' and 'ride_completed'. The existing 'payment'
-- value (added early in the project's history) is deliberately NOT reused
-- for this — it is already referenced defensively in both apps'
-- RATEABLE_STATUSES lists and the passenger ride-status screen's
-- navigate-to-complete-screen check as something that behaves like
-- "at or after ride_completed" (see apps/passenger/app/ride/[id]/page.tsx
-- and both rate/[id]/page.tsx files). Repurposing it to mean "before
-- ride_completed" would silently break those existing, working checks.
-- 'payment' itself is untouched and remains unused, exactly as before.
--
-- No existing status value's meaning changes. No historical ride row's
-- status is touched by this migration — every already-completed ride keeps
-- whatever status it already has.
-- ============================================================================

alter type public.ride_status_enum add value if not exists 'destination_reached' after 'ride_started';
alter type public.ride_status_enum add value if not exists 'payment_collected' after 'destination_reached';

alter table public.rides
  add column if not exists destination_reached_at timestamptz;

comment on column public.rides.destination_reached_at is 'Set once, server-side, by driver_mark_arrived_at_destination() — when the assigned driver confirmed arrival at the drop location. Null until then. Never client-writable directly (governed by protect_ride_flow_transitions, next migration).';
