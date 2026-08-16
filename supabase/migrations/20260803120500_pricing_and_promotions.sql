-- ============================================================================
-- 0006_pricing_and_promotions.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- pricing_rules — implements the locked fare model: base fare + per-km,
-- no surge (packages/utils/src/fare.ts FARE_RATES is the frontend mirror
-- of whatever the *active* row here says; this table is the source of
-- truth once the app is wired to Supabase). city_id nullable = global
-- default rule, used when no city-specific override exists.
-- ----------------------------------------------------------------------------
create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities (id) on delete cascade,
  vehicle_type public.vehicle_type_enum not null,
  base_fare numeric(10, 2) not null,
  per_km_rate numeric(10, 2) not null,
  cancellation_fee numeric(10, 2) not null default 0,
  is_active boolean not null default true,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint pricing_rules_base_fare_non_negative check (base_fare >= 0),
  constraint pricing_rules_per_km_rate_non_negative check (per_km_rate >= 0),
  constraint pricing_rules_cancellation_fee_non_negative check (cancellation_fee >= 0),
  constraint pricing_rules_effective_range check (effective_to is null or effective_to > effective_from)
);

create index pricing_rules_city_vehicle_idx on public.pricing_rules (city_id, vehicle_type);
-- At most one active, open-ended rule per (city, vehicle_type) — including
-- the global default where city_id is null. Postgres treats NULLs as
-- distinct in a unique index by default, which is exactly what's wanted
-- here (multiple global-default rows would otherwise be blocked as
-- "duplicate nulls"; this index still only allows one *active* one due to
-- the partial predicate, per city_id/vehicle_type pairing).
create unique index pricing_rules_one_active_per_city_vehicle_idx
  on public.pricing_rules (coalesce(city_id, '00000000-0000-0000-0000-000000000000'::uuid), vehicle_type)
  where is_active = true and effective_to is null and deleted_at is null;

create trigger set_updated_at
  before update on public.pricing_rules
  for each row execute function public.set_updated_at();

comment on table public.pricing_rules is 'Base fare + per-km pricing (no surge, by product decision). city_id null = global default. Only one active open-ended rule per city+vehicle_type at a time.';

-- ----------------------------------------------------------------------------
-- promo_codes
-- ----------------------------------------------------------------------------
create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text,
  discount_type public.promo_discount_type_enum not null,
  discount_value numeric(10, 2) not null,
  max_discount_amount numeric(10, 2),
  min_fare_amount numeric(10, 2) not null default 0,
  usage_limit integer,
  usage_limit_per_user integer not null default 1,
  times_used integer not null default 0,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint promo_codes_code_unique unique (code),
  constraint promo_codes_code_uppercase check (code = upper(code)),
  constraint promo_codes_discount_value_positive check (discount_value > 0),
  constraint promo_codes_percentage_range
    check (discount_type != 'percentage' or discount_value <= 100),
  constraint promo_codes_valid_range check (valid_until is null or valid_until > valid_from),
  constraint promo_codes_times_used_non_negative check (times_used >= 0),
  constraint promo_codes_usage_limit_positive check (usage_limit is null or usage_limit > 0)
);

create index promo_codes_active_idx on public.promo_codes (is_active) where deleted_at is null;

create trigger set_updated_at
  before update on public.promo_codes
  for each row execute function public.set_updated_at();

comment on table public.promo_codes is 'times_used is a denormalized counter maintained by the application (or a future trigger on rides) rather than COUNT(*) on every fare-estimate call, since promo validity is checked on the hot booking path.';
