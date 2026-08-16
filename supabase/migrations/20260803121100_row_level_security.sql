-- ============================================================================
-- 0012_row_level_security.sql
-- Enables RLS on every table and defines baseline policies. Scope note
-- (see also has_permission() comment in 0011): these policies enforce
-- "owner can see/edit their own data" and "any admin can see/edit
-- operational data" as the baseline. Per-permission-code restrictions
-- (e.g. only Finance Admin may edit pricing_rules) are NOT encoded as RLS
-- predicates here — that granularity is left to the application/API layer
-- calling has_permission(), which is available but unused by policies in
-- this phase. This is a deliberate scope decision, not an oversight; see
-- the accompanying review document for the reasoning.
--
-- No authentication flow is implemented by this migration or any other in
-- this phase — these policies simply define what an authenticated session
-- (once auth exists) would be allowed to do.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
alter table public.users enable row level security;

create policy "users_select_own" on public.users
  for select using (id = auth.uid());

create policy "users_select_admin" on public.users
  for select using (public.is_admin());

create policy "users_update_own" on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "users_all_admin" on public.users
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- passengers
-- ----------------------------------------------------------------------------
alter table public.passengers enable row level security;

create policy "passengers_select_own" on public.passengers
  for select using (id = auth.uid());

create policy "passengers_update_own" on public.passengers
  for update using (id = auth.uid()) with check (id = auth.uid());

-- A driver may view (not edit) the passenger of a ride currently assigned
-- to them — needed for the Driver app's "who am I picking up" screen.
create policy "passengers_select_active_ride_driver" on public.passengers
  for select using (
    exists (
      select 1 from public.rides r
      where r.passenger_id = passengers.id
        and r.driver_id = auth.uid()
        and r.status not in ('ride_completed', 'cancelled', 'rated')
    )
  );

create policy "passengers_all_admin" on public.passengers
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- drivers
-- ----------------------------------------------------------------------------
alter table public.drivers enable row level security;

create policy "drivers_select_own" on public.drivers
  for select using (id = auth.uid());

create policy "drivers_update_own" on public.drivers
  for update using (id = auth.uid()) with check (id = auth.uid());

-- A passenger may view the driver assigned to their active ride (name,
-- vehicle, rating, live location) — the Live Tracking screen's data need.
create policy "drivers_select_active_ride_passenger" on public.drivers
  for select using (
    exists (
      select 1 from public.rides r
      where r.driver_id = drivers.id
        and r.passenger_id = auth.uid()
        and r.status not in ('ride_completed', 'cancelled', 'rated')
    )
  );

-- Any authenticated passenger may see which drivers are online in
-- principle (needed for "drivers nearby" ETA display before a ride is
-- booked) — scoped to only the minimal columns an app would select, but
-- Postgres RLS is row-level not column-level, so this is intentionally
-- broad; a view exposing only non-sensitive columns is the recommended
-- follow-up if column-level restriction becomes necessary (see review doc).
create policy "drivers_select_online" on public.drivers
  for select using (is_online = true and verification_status = 'approved');

create policy "drivers_all_admin" on public.drivers
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- admin_users / admin_roles / admin_permissions / admin_role_permissions
-- ----------------------------------------------------------------------------
alter table public.admin_users enable row level security;
alter table public.admin_roles enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_role_permissions enable row level security;

create policy "admin_users_select_self" on public.admin_users
  for select using (id = auth.uid());

create policy "admin_users_select_all_admin" on public.admin_users
  for select using (public.is_admin());

-- Only super admins manage other admins' role assignments.
create policy "admin_users_write_super_admin" on public.admin_users
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy "admin_roles_select_admin" on public.admin_roles
  for select using (public.is_admin());

create policy "admin_roles_write_super_admin" on public.admin_roles
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy "admin_permissions_select_admin" on public.admin_permissions
  for select using (public.is_admin());

create policy "admin_permissions_write_super_admin" on public.admin_permissions
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy "admin_role_permissions_select_admin" on public.admin_role_permissions
  for select using (public.is_admin());

create policy "admin_role_permissions_write_super_admin" on public.admin_role_permissions
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ----------------------------------------------------------------------------
-- cities / app_settings — public read (any authenticated user), admin write
-- ----------------------------------------------------------------------------
alter table public.cities enable row level security;
alter table public.app_settings enable row level security;

create policy "cities_select_authenticated" on public.cities
  for select using (auth.role() = 'authenticated' and is_active = true);

create policy "cities_all_admin" on public.cities
  for all using (public.is_admin()) with check (public.is_admin());

create policy "app_settings_select_authenticated" on public.app_settings
  for select using (auth.role() = 'authenticated');

create policy "app_settings_all_admin" on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- vehicles / driver_documents — driver owns their own, admin sees all
-- ----------------------------------------------------------------------------
alter table public.vehicles enable row level security;
alter table public.driver_documents enable row level security;

create policy "vehicles_select_own" on public.vehicles
  for select using (driver_id = auth.uid());

create policy "vehicles_write_own" on public.vehicles
  for insert with check (driver_id = auth.uid());

create policy "vehicles_update_own" on public.vehicles
  for update using (driver_id = auth.uid()) with check (driver_id = auth.uid());

create policy "vehicles_all_admin" on public.vehicles
  for all using (public.is_admin()) with check (public.is_admin());

create policy "driver_documents_select_own" on public.driver_documents
  for select using (driver_id = auth.uid());

create policy "driver_documents_insert_own" on public.driver_documents
  for insert with check (driver_id = auth.uid());

-- Drivers may NOT update status/reviewed_by/reviewed_at themselves — only
-- admins review documents. Drivers re-upload by inserting a new row
-- (see 0005 comment), not by updating an existing one.
create policy "driver_documents_all_admin" on public.driver_documents
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- pricing_rules / promo_codes — public read of active rows, admin write
-- ----------------------------------------------------------------------------
alter table public.pricing_rules enable row level security;
alter table public.promo_codes enable row level security;

create policy "pricing_rules_select_authenticated" on public.pricing_rules
  for select using (auth.role() = 'authenticated' and is_active = true);

create policy "pricing_rules_all_admin" on public.pricing_rules
  for all using (public.is_admin()) with check (public.is_admin());

create policy "promo_codes_select_active" on public.promo_codes
  for select using (
    auth.role() = 'authenticated'
    and is_active = true
    and (valid_until is null or valid_until > now())
  );

create policy "promo_codes_all_admin" on public.promo_codes
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- subscriptions / subscription_payments — driver reads own; writes are
-- deliberately admin/service-role only (payment-provider webhooks and
-- subscription issuance should never be client-writable directly).
-- ----------------------------------------------------------------------------
alter table public.subscriptions enable row level security;
alter table public.subscription_payments enable row level security;

create policy "subscriptions_select_own" on public.subscriptions
  for select using (driver_id = auth.uid());

create policy "subscriptions_all_admin" on public.subscriptions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "subscription_payments_select_own" on public.subscription_payments
  for select using (driver_id = auth.uid());

create policy "subscription_payments_all_admin" on public.subscription_payments
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- rides — the most important policy set. Passengers manage their own
-- rides; drivers see/act on rides assigned to them; admins see everything.
-- ----------------------------------------------------------------------------
alter table public.rides enable row level security;

create policy "rides_select_passenger" on public.rides
  for select using (passenger_id = auth.uid());

create policy "rides_select_driver" on public.rides
  for select using (driver_id = auth.uid());

create policy "rides_insert_passenger" on public.rides
  for insert with check (passenger_id = auth.uid());

-- Passengers may only update their own ride while it hasn't progressed
-- past acceptance (e.g. cancelling) — not, say, rewriting the fare.
create policy "rides_update_passenger" on public.rides
  for update using (
    passenger_id = auth.uid() and status in ('requested', 'matched', 'accepted', 'driver_arriving')
  ) with check (passenger_id = auth.uid());

-- Drivers update rides assigned to them (accept, progress status, etc.).
create policy "rides_update_driver" on public.rides
  for update using (driver_id = auth.uid()) with check (driver_id = auth.uid());

create policy "rides_all_admin" on public.rides
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- ride_events — readable by ride participants + admin. No INSERT policy
-- for passenger/driver roles: event-log writes are intended to go through
-- a trusted server context (service-role client / Route Handler), not
-- directly from the client, so the audit trail can't be forged by either
-- party to a ride. Admins can still insert (e.g. manual notes).
-- ----------------------------------------------------------------------------
alter table public.ride_events enable row level security;

create policy "ride_events_select_participant" on public.ride_events
  for select using (
    exists (
      select 1 from public.rides r
      where r.id = ride_events.ride_id
        and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

create policy "ride_events_all_admin" on public.ride_events
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- ratings — either participant may insert their own rating for a ride they
-- were part of; both participants (and admin) may read.
-- ----------------------------------------------------------------------------
alter table public.ratings enable row level security;

create policy "ratings_select_participant" on public.ratings
  for select using (rater_id = auth.uid() or ratee_id = auth.uid());

create policy "ratings_insert_participant" on public.ratings
  for insert with check (
    rater_id = auth.uid()
    and exists (
      select 1 from public.rides r
      where r.id = ratings.ride_id
        and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

create policy "ratings_all_admin" on public.ratings
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- wallets / wallet_transactions — owner reads only. No client-side INSERT/
-- UPDATE policy on either table: wallet balance changes must go through a
-- trusted server-side path (service-role client or a future RPC function)
-- so a balance can never be forged directly by a client write. Admins get
-- full access for support/reconciliation.
-- ----------------------------------------------------------------------------
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

create policy "wallets_select_own" on public.wallets
  for select using (user_id = auth.uid());

create policy "wallets_all_admin" on public.wallets
  for all using (public.is_admin()) with check (public.is_admin());

create policy "wallet_transactions_select_own" on public.wallet_transactions
  for select using (
    exists (select 1 from public.wallets w where w.id = wallet_transactions.wallet_id and w.user_id = auth.uid())
  );

create policy "wallet_transactions_all_admin" on public.wallet_transactions
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- notifications — owner reads own, may mark as read (update), never
-- inserts their own (notifications are system/admin-generated).
-- ----------------------------------------------------------------------------
alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid());

create policy "notifications_update_own_mark_read" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "notifications_all_admin" on public.notifications
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- support_tickets — reporter reads/creates own; assigned admin (or any
-- admin) reads/updates.
-- ----------------------------------------------------------------------------
alter table public.support_tickets enable row level security;

create policy "support_tickets_select_own" on public.support_tickets
  for select using (user_id = auth.uid());

create policy "support_tickets_insert_own" on public.support_tickets
  for insert with check (user_id = auth.uid());

create policy "support_tickets_all_admin" on public.support_tickets
  for all using (public.is_admin()) with check (public.is_admin());
