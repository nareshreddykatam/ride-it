-- ============================================================================
-- 0003_lookup_tables.sql
-- Reference/lookup tables with no foreign-key dependency on identity tables.
-- Created first so later tables (pricing_rules, rides, admin_users, ...) can
-- reference them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- cities — service-area scoping (flagged as an open PRD question in earlier
-- product passes; modeling it as a table rather than hardcoding assumes
-- multi-city from day one, which is the safer default to build against).
-- ----------------------------------------------------------------------------
create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text,
  country text not null default 'India',
  is_active boolean not null default true,
  launched_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cities_name_country_unique unique (name, country)
);

create index cities_is_active_idx on public.cities (is_active) where deleted_at is null;

create trigger set_updated_at
  before update on public.cities
  for each row execute function public.set_updated_at();

comment on table public.cities is 'Service-area scoping. Soft-deleted via deleted_at; a city is "live" when is_active = true and deleted_at is null.';

-- ----------------------------------------------------------------------------
-- admin_roles — deliberately a table, not an enum, because the Admin app's
-- proposed RBAC set (Support/Finance/Operations Admin) is expected to
-- change without a schema migration every time.
-- ----------------------------------------------------------------------------
create table public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint admin_roles_name_unique unique (name)
);

create trigger set_updated_at
  before update on public.admin_roles
  for each row execute function public.set_updated_at();

comment on table public.admin_roles is 'RBAC roles (e.g. support_admin, finance_admin, operations_admin, super_admin). Row-based rather than enum so new roles don''t require a migration.';

-- ----------------------------------------------------------------------------
-- admin_permissions — atomic, granular permission codes (e.g.
-- 'drivers.approve', 'pricing.edit'). Attached to roles via the
-- admin_role_permissions join table below.
-- ----------------------------------------------------------------------------
create table public.admin_permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_permissions_code_unique unique (code),
  constraint admin_permissions_code_format check (code ~ '^[a-z_]+\.[a-z_]+$')
);

create trigger set_updated_at
  before update on public.admin_permissions
  for each row execute function public.set_updated_at();

comment on table public.admin_permissions is 'Atomic permission codes in "resource.action" form, e.g. "drivers.approve". No deleted_at — permissions are a fixed vocabulary maintained by migration, not runtime data.';

-- ----------------------------------------------------------------------------
-- admin_role_permissions — many-to-many join. Not explicitly named in the
-- original table list, but required to normalize admin_roles <-> 
-- admin_permissions rather than duplicating permission codes into an array
-- column on admin_roles (which would violate normalization).
-- ----------------------------------------------------------------------------
create table public.admin_role_permissions (
  admin_role_id uuid not null references public.admin_roles (id) on delete cascade,
  admin_permission_id uuid not null references public.admin_permissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (admin_role_id, admin_permission_id)
);

create index admin_role_permissions_permission_idx on public.admin_role_permissions (admin_permission_id);

comment on table public.admin_role_permissions is 'Join table normalizing the many-to-many between admin_roles and admin_permissions.';

-- ----------------------------------------------------------------------------
-- app_settings — key/value platform configuration (maintenance mode,
-- supported languages, notification template pointers, app version floor).
-- jsonb value column keeps this table generic rather than adding a new
-- column per setting.
-- ----------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid, -- FK to admin_users added in 0004 once that table exists
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

comment on table public.app_settings is 'Generic key/value platform config, e.g. {"key": "maintenance_mode", "value": false}. updated_by FK added in a later migration once admin_users exists.';
