-- ============================================================================
-- 0008_rides.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- rides — the central table. FK delete rules deliberately asymmetric:
--   passenger_id: RESTRICT — ride/financial history must not vanish if a
--     passenger row is hard-deleted (shouldn't happen anyway; soft-delete
--     via users.deleted_at is the supported path, see 0004).
--   driver_id: SET NULL — a ride's historical record is still meaningful
--     even if we lose the driver association (e.g. a rare hard-delete for
--     legal/compliance reasons); the ride shouldn't disappear with them.
-- pickup_location/drop_location are PostGIS points (see drivers.current_location
-- for the matching rationale) with GIST indexes for spatial queries (e.g.
-- "rides that started within this city's bounding area").
-- ----------------------------------------------------------------------------
create table public.rides (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.passengers (id) on delete restrict,
  driver_id uuid references public.drivers (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  city_id uuid references public.cities (id) on delete set null,
  vehicle_type public.vehicle_type_enum not null,
  status public.ride_status_enum not null default 'requested',

  pickup_location extensions.geography(Point, 4326) not null,
  pickup_address text,
  drop_location extensions.geography(Point, 4326) not null,
  drop_address text,
  distance_km numeric(6, 2),

  base_fare numeric(10, 2) not null,
  distance_fare numeric(10, 2) not null,
  discount_amount numeric(10, 2) not null default 0,
  total_fare numeric(10, 2) not null,
  currency char(3) not null default 'INR',
  promo_code_id uuid references public.promo_codes (id) on delete set null,

  otp char(4) not null,
  payment_method public.payment_method_enum,
  payment_status public.payment_status_enum not null default 'pending',

  -- Denormalized rating summary for fast reads on the ride itself (e.g.
  -- ride history lists) without joining `ratings`. The `ratings` table
  -- below remains the normalized source of truth (with comments, audit
  -- trail); these two columns are a deliberate, documented redundancy —
  -- kept in sync by the application layer (or a future trigger).
  passenger_rating smallint,
  driver_rating smallint,

  cancelled_by public.cancelled_by_enum,
  cancellation_reason text,

  requested_at timestamptz not null default now(),
  matched_at timestamptz,
  accepted_at timestamptz,
  otp_verified_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint rides_distance_km_non_negative check (distance_km is null or distance_km >= 0),
  constraint rides_base_fare_non_negative check (base_fare >= 0),
  constraint rides_distance_fare_non_negative check (distance_fare >= 0),
  constraint rides_discount_amount_non_negative check (discount_amount >= 0),
  constraint rides_total_fare_non_negative check (total_fare >= 0),
  -- The fare model is base + distance, minus any promo discount — enforced
  -- here so no code path can silently write an inconsistent total.
  constraint rides_total_fare_matches_components
    check (total_fare = base_fare + distance_fare - discount_amount),
  constraint rides_otp_format check (otp ~ '^[0-9]{4}$'),
  constraint rides_passenger_rating_range
    check (passenger_rating is null or passenger_rating between 1 and 5),
  constraint rides_driver_rating_range
    check (driver_rating is null or driver_rating between 1 and 5),
  -- Cancelled rides must record who cancelled and why; completed fare
  -- integrity is enforced above regardless of status.
  constraint rides_cancellation_requires_reason
    check (status != 'cancelled' or (cancelled_by is not null and cancellation_reason is not null))
);

create index rides_passenger_idx on public.rides (passenger_id, requested_at desc);
create index rides_driver_idx on public.rides (driver_id, requested_at desc);
create index rides_city_idx on public.rides (city_id);
create index rides_pickup_location_idx on public.rides using gist (pickup_location);
create index rides_drop_location_idx on public.rides using gist (drop_location);
-- The Admin "Live Rides" screen filters to in-progress rides constantly —
-- a partial index keeps that query cheap regardless of total ride history size.
create index rides_active_status_idx on public.rides (status, requested_at desc)
  where status not in ('ride_completed', 'cancelled', 'rated');

create trigger set_updated_at
  before update on public.rides
  for each row execute function public.set_updated_at();

comment on table public.rides is 'Core ride record. total_fare is DB-enforced to equal base_fare + distance_fare - discount_amount (no surge, by product decision). passenger_rating/driver_rating are a denormalized read-shortcut; ratings table is the normalized source of truth.';

-- ----------------------------------------------------------------------------
-- ride_events — immutable audit/event log of everything that happens to a
-- ride (status transitions, location pings, admin interventions). Append-
-- only by design: no updated_at, no deleted_at, no UPDATE trigger. This is
-- what lets Admin's dispute-investigation view reconstruct exactly what
-- happened and when, independent of the current `rides` row state.
-- ----------------------------------------------------------------------------
create table public.ride_events (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  event_type text not null,
  actor_type public.actor_type_enum not null,
  actor_id uuid, -- nullable: actor_type = 'system' events have no user actor
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ride_events_type_format check (event_type ~ '^[a-z][a-z0-9_]*$')
);

create index ride_events_ride_idx on public.ride_events (ride_id, created_at);
create index ride_events_type_idx on public.ride_events (event_type);

comment on table public.ride_events is 'Append-only event log per ride (status_changed, location_ping, driver_reassigned, admin_note, ...). Never updated or deleted — this is the audit trail rides.status alone can''t reconstruct.';

-- ----------------------------------------------------------------------------
-- ratings — normalized rating record, one row per (ride, direction). Two
-- rows possible per ride: passenger-rates-driver and driver-rates-passenger.
-- This is the source of truth; rides.passenger_rating/driver_rating are a
-- denormalized mirror for cheap reads (see comment on rides above).
-- ----------------------------------------------------------------------------
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  rated_by public.rated_by_enum not null,
  rater_id uuid not null references public.users (id) on delete cascade,
  ratee_id uuid not null references public.users (id) on delete cascade,
  rating smallint not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ratings_rating_range check (rating between 1 and 5),
  constraint ratings_rater_not_ratee check (rater_id != ratee_id),
  -- One rating per direction per ride — a passenger can't rate the same
  -- ride's driver twice.
  constraint ratings_one_per_ride_direction unique (ride_id, rated_by)
);

create index ratings_ratee_idx on public.ratings (ratee_id);
create index ratings_ride_idx on public.ratings (ride_id);

create trigger set_updated_at
  before update on public.ratings
  for each row execute function public.set_updated_at();

comment on table public.ratings is 'Normalized ratings, one row per (ride, direction). Source of truth for average-rating calculations; rides.passenger_rating/driver_rating are a denormalized shortcut kept in sync by the application layer.';
