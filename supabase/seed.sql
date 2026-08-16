-- ============================================================================
-- seed.sql
-- Runs on `supabase db reset` for local development. Deliberately limited to
-- reference/lookup data (cities, pricing, RBAC roles, default settings) —
-- NOT fake users/drivers/rides, since no auth flow exists yet to create
-- real auth.users rows for them to reference. User-bearing sample data is a
-- Phase 4+ concern once auth is wired up.
--
-- Values below are intentionally kept in sync with existing frontend mocks:
--   - pricing_rules matches packages/utils/src/fare.ts FARE_RATES exactly
--   - admin_roles/admin_permissions matches the RBAC proposal shown in
--     apps/admin/app/(dashboard)/admin-users/page.tsx
-- ============================================================================

-- ----------------------------------------------------------------------------
-- cities
-- ----------------------------------------------------------------------------
-- Launch order per product decision (Phase 7): Vijayawada -> Hyderabad ->
-- additional cities. Both seeded as active/launched here since this repo's
-- seed data represents "current state," not a staged rollout script — the
-- Admin Cities screen is where a real staged activation would happen.
insert into public.cities (name, state, country, is_active, launched_at)
values
  ('Vijayawada', 'Andhra Pradesh', 'India', true, (current_date - interval '30 days')::date),
  ('Hyderabad', 'Telangana', 'India', true, current_date)
on conflict (name, country) do nothing;

-- ----------------------------------------------------------------------------
-- pricing_rules — global defaults (city_id null), mirrors FARE_RATES in
-- packages/utils/src/fare.ts. No surge component, by product decision.
-- ----------------------------------------------------------------------------
insert into public.pricing_rules (city_id, vehicle_type, base_fare, per_km_rate, cancellation_fee)
values
  (null, 'bike', 15.00, 6.00, 20.00),
  (null, 'auto', 25.00, 12.00, 30.00);

-- ----------------------------------------------------------------------------
-- admin_roles + admin_permissions + admin_role_permissions — mirrors the
-- RBAC matrix already proposed in the Admin app UI.
-- ----------------------------------------------------------------------------
insert into public.admin_roles (name, description) values
  ('support_admin', 'Views drivers/passengers, responds to complaints, views ride details. Cannot edit pricing, approve payouts, or suspend accounts.'),
  ('finance_admin', 'Views/edits subscription pricing, views payment reports, issues refunds. Cannot approve driver documents or suspend accounts.'),
  ('operations_admin', 'Approves/rejects driver documents, suspends accounts, reassigns/cancels live rides, toggles maintenance mode. Cannot edit subscription pricing.');

insert into public.admin_permissions (code, description) values
  ('drivers.view', 'View driver profiles and documents'),
  ('drivers.approve', 'Approve or reject driver document verification'),
  ('passengers.view', 'View passenger profiles and ride history'),
  ('accounts.suspend', 'Suspend driver or passenger accounts'),
  ('rides.view', 'View ride details'),
  ('rides.reassign', 'Reassign or cancel a live ride'),
  ('complaints.respond', 'Respond to support tickets/complaints'),
  ('pricing.view', 'View subscription and fare pricing configuration'),
  ('pricing.edit', 'Edit subscription and fare pricing configuration'),
  ('payments.view', 'View subscription payment reports'),
  ('refunds.issue', 'Issue refunds for disputed rides'),
  ('maintenance.toggle', 'Toggle platform maintenance mode');

insert into public.admin_role_permissions (admin_role_id, admin_permission_id)
select r.id, p.id from public.admin_roles r, public.admin_permissions p
where
  (r.name = 'support_admin' and p.code in ('drivers.view', 'passengers.view', 'rides.view', 'complaints.respond'))
  or (r.name = 'finance_admin' and p.code in ('pricing.view', 'pricing.edit', 'payments.view', 'refunds.issue'))
  or (r.name = 'operations_admin' and p.code in ('drivers.view', 'drivers.approve', 'accounts.suspend', 'rides.view', 'rides.reassign', 'maintenance.toggle'));

-- ----------------------------------------------------------------------------
-- app_settings — defaults matching the Admin Settings screen's mock state
-- ----------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('maintenance_mode', 'false', 'Blocks new bookings across Passenger and Driver apps during planned downtime'),
  ('supported_languages', '["en"]', 'ISO 639-1 codes. English-only until the multilingual PRD gap is resolved'),
  ('passenger_app_min_version', '"1.4.2"', 'Minimum Passenger app version allowed to book a ride'),
  ('driver_app_min_version', '"1.3.0"', 'Minimum Driver app version allowed to go online');
