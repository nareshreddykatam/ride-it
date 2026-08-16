-- ============================================================================
-- 20260817090000_fix_ride_payment_method_rls.sql
-- Phase 12. REAL BUG FOUND BY ACTUALLY RUNNING THE DATABASE — not caught
-- by six phases of static review, only surfaced by live RLS testing
-- against a real Postgres session (see PHASE_12_REAL_ENVIRONMENT_INTEGRATION_REVIEW.md).
--
-- rides_update_passenger (Phase 3) only ever permitted a passenger to
-- update their own ride while status was in ('requested', 'matched',
-- 'accepted', 'driver_arriving'). But payment method selection — the
-- entire point of the Passenger app's ride-complete screen (Phase 5,
-- extended with real online payment in Phase 11) — happens AFTER the
-- ride reaches 'ride_completed'. A live test (SET LOCAL request.jwt.claims
-- simulating a real passenger session, then attempting
-- `UPDATE rides SET payment_method = 'online' WHERE status =
-- 'ride_completed'`) returned "UPDATE 0" — RLS silently blocked it. This
-- means the ENTIRE payment-method-selection step, for every payment
-- method including cash, would have failed against any real Supabase
-- project, undetected until this phase's live testing.
--
-- Fix: widen the allowed status list to include the post-completion
-- states where payment method selection legitimately still needs to
-- happen — 'ride_completed', 'payment' (the reserved-but-unused status,
-- kept for consistency with create_pending_ride_payment's own eligible-
-- states list), and 'rated'. payment_method remains the only column this
-- policy was ever meant to let a passenger freely change post-completion
-- — every financial column is still independently blocked by
-- protect_ride_financial_columns (Phase 11), unaffected by this fix.
-- ============================================================================

drop policy if exists "rides_update_passenger" on public.rides;

create policy "rides_update_passenger" on public.rides
  for update using (
    passenger_id = auth.uid()
    and status in ('requested', 'matched', 'accepted', 'driver_arriving', 'ride_completed', 'payment', 'rated')
  ) with check (passenger_id = auth.uid());

comment on policy "rides_update_passenger" on public.rides is
  'Phase 12 fix: extended beyond the original pre-completion status list so payment method selection (cash/driver_upi/online) — which only ever happens after ride_completed — actually works. protect_ride_financial_columns (Phase 11) independently still blocks every financial column regardless of ride status; this policy only ever needed to gate row-level reachability, and payment_method was always the one column intentionally left open to direct passenger update.';
