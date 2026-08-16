-- ============================================================================
-- 20260818090000_safety_schema_extensions.sql
-- Phase 13. Extends existing structures rather than duplicating them:
-- support_tickets (Phase 3) already has exactly the right shape for
-- "reports" (category, description, ride association, reporter,
-- timestamp, status) — it only needed a "who is being reported" column
-- and a few more categories, not a parallel reports table.
-- notification_type_enum (Phase 3) already covers most safety
-- notifications via 'system'; one new value ('safety') is added because
-- being able to specifically filter/query safety notifications has real
-- operational value for this phase's subject matter.
-- ============================================================================

alter type public.notification_type_enum add value 'safety';

create type public.safety_event_status_enum as enum (
  'open', 'acknowledged', 'investigating', 'resolved', 'closed'
);

create type public.support_ticket_severity_enum as enum ('low', 'medium', 'high', 'critical');

-- New categories: 'safety', 'driver_issue' (reporting a driver — distinct
-- from the existing 'driver_verification', which is about a driver's OWN
-- verification status, not someone reporting them), 'passenger_issue',
-- 'lost_item', 'app_problem'. Existing values ('ride_issue',
-- 'payment_issue', 'account', 'driver_verification', 'other') untouched.
alter type public.support_ticket_category_enum add value 'safety';
alter type public.support_ticket_category_enum add value 'driver_issue';
alter type public.support_ticket_category_enum add value 'passenger_issue';
alter type public.support_ticket_category_enum add value 'lost_item';
alter type public.support_ticket_category_enum add value 'app_problem';

alter table public.support_tickets add column reported_user_id uuid references public.users (id) on delete set null;
alter table public.support_tickets add column severity public.support_ticket_severity_enum not null default 'medium';

comment on column public.support_tickets.reported_user_id is 'Who is being reported, if this ticket is a report about a specific person (driver/passenger) rather than a general support request. Nullable — most tickets have no reported party.';

create index support_tickets_reported_user_idx on public.support_tickets (reported_user_id) where reported_user_id is not null;

-- ----------------------------------------------------------------------------
-- Configuration-driven emergency contact number (item 5: "Do not hardcode
-- an emergency number throughout the application"). Reuses app_settings
-- (Phase 7/8) rather than a new table. The seeded value is India's real
-- national emergency number (public information, not a secret) — the app
-- only ever offers it as a phone/dial action, never claims to have
-- contacted it on the user's behalf. See the Phase 13 review doc's
-- explicit "no emergency-service integration exists" statement.
-- ----------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('emergency_contact_number', '"112"', 'India''s national emergency number, shown as a tap-to-call action in the Safety section. Configuration-driven — never hardcoded in application code. Ride It has no API integration with emergency services; this is a phone dial action only.')
on conflict (key) do nothing;
