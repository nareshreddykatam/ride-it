-- ============================================================================
-- 0004_users_and_profiles.sql
-- Identity tables. `users` is a 1:1 profile extension of Supabase's built-in
-- auth.users (not a replacement for it) — auth.users owns credentials and
-- session state; public.users owns the app-facing profile fields every role
-- shares. passengers/drivers/admin_users each extend `users` 1:1 for their
-- role-specific fields, rather than one wide table with nullable columns
-- for every role (keeps constraints meaningful — e.g. NOT NULL vehicle_type
-- only makes sense for drivers).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- users — shared profile row for every person in the system, regardless of
-- role. id is NOT a fresh gen_random_uuid(): it IS auth.users.id, enforced
-- by the foreign key + being the primary key. Deleting the auth.users row
-- cascades here (account deletion removes the profile), but see passengers/
-- drivers below for why *their* rows use ON DELETE RESTRICT instead.
-- ----------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role_enum not null,
  phone text not null,
  full_name text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint users_phone_unique unique (phone),
  constraint users_phone_format check (phone ~ '^[6-9][0-9]{9}$')
);

create index users_role_idx on public.users (role) where deleted_at is null;

create trigger set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

comment on table public.users is 'Shared profile for every role. id = auth.users.id (1:1). Role-specific fields live in passengers/drivers/admin_users, each keyed by the same id.';

-- ----------------------------------------------------------------------------
-- passengers — extends users. ON DELETE RESTRICT (not CASCADE): a passenger
-- with ride history must not be hard-deletable while rides.passenger_id
-- still points at them — soft-delete (users.deleted_at) is the supported
-- path for "remove a passenger" instead. This preserves ride/financial
-- history integrity, which matters more here than a clean cascade.
-- ----------------------------------------------------------------------------
create table public.passengers (
  id uuid primary key references public.users (id) on delete restrict,
  rating numeric(2, 1) not null default 5.0,
  total_rides integer not null default 0,
  default_payment_method public.payment_method_enum,
  home_city_id uuid references public.cities (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint passengers_rating_range check (rating >= 0 and rating <= 5),
  constraint passengers_total_rides_non_negative check (total_rides >= 0)
);

create index passengers_home_city_idx on public.passengers (home_city_id);

create trigger set_updated_at
  before update on public.passengers
  for each row execute function public.set_updated_at();

comment on table public.passengers is 'Passenger-specific profile fields. 1:1 extension of users. No separate deleted_at — soft-delete is expressed via the parent users row.';

-- ----------------------------------------------------------------------------
-- drivers — extends users. Same ON DELETE RESTRICT reasoning as passengers,
-- doubly important here since subscriptions/subscription_payments/
-- wallet financial history must survive.
--
-- current_location uses PostGIS geography(Point,4326) rather than plain
-- lat/lng numerics specifically so "find nearest online drivers" can use a
-- GIST index (ST_DWithin / KNN <->) instead of a full table scan — this is
-- the one query every ride-matching flow depends on, so it's worth the
-- extension dependency.
-- ----------------------------------------------------------------------------
create table public.drivers (
  id uuid primary key references public.users (id) on delete restrict,
  vehicle_type public.vehicle_type_enum not null,
  verification_status public.driver_verification_status_enum not null default 'pending',
  rating numeric(2, 1) not null default 5.0,
  total_rides integer not null default 0,
  strike_count integer not null default 0,
  is_online boolean not null default false,
  current_city_id uuid references public.cities (id) on delete set null,
  current_location extensions.geography(Point, 4326),
  location_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drivers_rating_range check (rating >= 0 and rating <= 5),
  constraint drivers_total_rides_non_negative check (total_rides >= 0),
  constraint drivers_strike_count_non_negative check (strike_count >= 0)
);

create index drivers_verification_status_idx on public.drivers (verification_status);
create index drivers_current_city_idx on public.drivers (current_city_id);
-- Partial index: only online, approved drivers are ever candidates for
-- ride matching, so the index that matters most excludes everyone else.
create index drivers_online_location_idx on public.drivers using gist (current_location)
  where is_online = true and verification_status = 'approved';

create trigger set_updated_at
  before update on public.drivers
  for each row execute function public.set_updated_at();

comment on table public.drivers is 'Driver-specific profile fields. 1:1 extension of users. current_location is a PostGIS geography point kept fresh by the app on each location ping.';

-- ----------------------------------------------------------------------------
-- admin_users — extends users for the Admin dashboard. admin_role_id is
-- RESTRICT (not CASCADE/SET NULL): deleting a role while admins still hold
-- it should fail loudly rather than silently leaving an admin with no role.
-- Reassign or deactivate admins before removing a role.
-- ----------------------------------------------------------------------------
create table public.admin_users (
  id uuid primary key references public.users (id) on delete restrict,
  admin_role_id uuid not null references public.admin_roles (id) on delete restrict,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index admin_users_role_idx on public.admin_users (admin_role_id);

create trigger set_updated_at
  before update on public.admin_users
  for each row execute function public.set_updated_at();

comment on table public.admin_users is 'Admin-specific profile. 1:1 extension of users. is_super_admin bypasses granular admin_permissions checks at the application layer.';

-- Now that admin_users exists, wire the FK that 0003 deferred.
alter table public.app_settings
  add constraint app_settings_updated_by_fkey
  foreign key (updated_by) references public.admin_users (id) on delete set null;
