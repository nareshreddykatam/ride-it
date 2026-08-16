-- ============================================================================
-- 20260813090000_ride_offers.sql
-- Phase 8. Introduces the per-driver ride offer as a first-class row.
--
-- Why this table is necessary, not incidental: rides_select_driver (Phase
-- 3) is `using (driver_id = auth.uid())` — it has NEVER permitted a driver
-- to see an unassigned ride (driver_id IS NULL can never equal auth.uid()).
-- Phase 6's getNextAvailableRideRequest() queried `rides` directly for
-- unassigned rows and would have silently returned nothing against a real
-- database — a latent bug never caught because nothing in this project has
-- run against a live Supabase project until this environment. ride_offers
-- fixes this the correct way: instead of widening rides_select_driver
-- (which would let every driver browse every pending ride's passenger_id,
-- fare, and addresses — far broader than needed), each driver gets their
-- own narrow, RLS-scoped offer row, populated by a SECURITY DEFINER
-- dispatch function with only the display fields a driver actually needs
-- (denormalized snapshot — see column comments below). The driver's app
-- never needs to read `rides` directly until after they've won it.
-- ============================================================================

create table public.ride_offers (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'expired', 'superseded')),
  batch_number integer not null default 1,

  -- Denormalized snapshot captured at offer time — the driver's own RLS
  -- policy only grants them their own offers, so exposing these here
  -- (rather than requiring a join into `rides`, which their role can't
  -- read pre-acceptance) is what keeps rides_select_driver untouched.
  vehicle_type public.vehicle_type_enum not null,
  pickup_address text,
  drop_address text,
  distance_km numeric(6, 2),
  base_fare numeric(10, 2) not null,
  distance_fare numeric(10, 2) not null,
  total_fare numeric(10, 2) not null,
  currency char(3) not null default 'INR',
  distance_to_pickup_meters numeric,

  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),

  constraint ride_offers_unique_ride_driver_batch unique (ride_id, driver_id, batch_number)
);

-- The driver's "do I have a pending offer right now" query, and the
-- expiry sweep's "which pending offers are stale" query.
create index ride_offers_driver_status_idx on public.ride_offers (driver_id, status);
create index ride_offers_ride_status_idx on public.ride_offers (ride_id, status);
create index ride_offers_pending_expiry_idx on public.ride_offers (expires_at) where status = 'pending';

comment on table public.ride_offers is 'One row per (ride, driver, batch) offer extended during matching. Append-heavy, status-mutated by SECURITY DEFINER matching functions only — no direct client INSERT/UPDATE policy (see RLS below).';

alter table public.ride_offers enable row level security;

-- Driver sees only offers made to them — this is the actual privacy
-- boundary that replaces "browse all pending rides."
create policy "ride_offers_select_own_driver" on public.ride_offers
  for select using (driver_id = auth.uid());

-- No insert/update policy for driver or passenger roles at all — offers
-- are created and transitioned exclusively by the SECURITY DEFINER
-- matching functions in the next migration. This mirrors ride_events'
-- existing "server-authoritative, not client-writable" design (Phase 3).
create policy "ride_offers_all_admin" on public.ride_offers
  for all using (public.is_admin()) with check (public.is_admin());

comment on policy "ride_offers_select_own_driver" on public.ride_offers is
  'The whole point of this table: a driver can see their own offers, never another driver''s, and never the full pool of pending rides.';
