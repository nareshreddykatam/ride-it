-- ============================================================================
-- 20260914090100_restaurant_owners_and_restaurants.sql
-- Ridora Food Phase 1.
--
-- restaurant_owners extends users 1:1, exactly like passengers/drivers/
-- admin_users (0004_users_and_profiles.sql) — same reasoning: a restaurant
-- owner is a distinct identity kind with its own capability surface, and
-- role-specific fields belong on their own table rather than nullable
-- columns on a shared one. An owner may run more than one restaurant (no
-- uniqueness constraint from owner -> restaurant), unlike the strictly 1:1
-- role tables above.
--
-- restaurants.status lifecycle intentionally has NO "live" value — see
-- comment in 20260914090000. A restaurant is actually orderable only when
-- status = 'approved' AND is_open = true AND it holds an active
-- restaurant_subscriptions row; every RPC/RLS surface that needs "is this
-- restaurant live" computes that condition directly rather than trusting a
-- single denormalized flag that could drift, the same way ride matching
-- never trusts a single "driver.can_receive_offers" column.
-- ============================================================================

create table public.restaurant_owners (
  id uuid primary key references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.restaurant_owners
  for each row execute function public.set_updated_at();

comment on table public.restaurant_owners is 'Restaurant-owner-specific profile. 1:1 extension of users, mirroring passengers/drivers/admin_users. An owner may own more than one restaurant.';

alter table public.restaurant_owners enable row level security;

create policy "restaurant_owners_select_own" on public.restaurant_owners
  for select using (id = auth.uid());

create policy "restaurant_owners_all_admin" on public.restaurant_owners
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- is_restaurant_owner() — same shortcut pattern as is_driver()/is_passenger()
-- in 0011_auth_helper_functions.sql.
-- ----------------------------------------------------------------------------
create or replace function public.is_restaurant_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_role_is('restaurant_owner');
$$;

-- ----------------------------------------------------------------------------
-- restaurants
-- ----------------------------------------------------------------------------
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.restaurant_owners (id) on delete restrict,
  name text not null,
  description text,
  status public.restaurant_status_enum not null default 'pending_verification',
  rejection_reason text,
  suspended_reason text,
  address text not null,
  landmark text,
  city_id uuid references public.cities (id) on delete set null,
  location extensions.geography(Point, 4326) not null,
  phone text not null,
  email text,
  is_open boolean not null default false,
  avg_preparation_minutes integer not null default 30,
  rating numeric(2, 1) not null default 5.0,
  total_ratings integer not null default 0,
  total_orders integer not null default 0,
  logo_path text,
  cover_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint restaurants_phone_format check (phone ~ '^[6-9][0-9]{9}$'),
  constraint restaurants_avg_prep_positive check (avg_preparation_minutes > 0),
  constraint restaurants_rating_range check (rating >= 0 and rating <= 5),
  constraint restaurants_total_ratings_non_negative check (total_ratings >= 0),
  constraint restaurants_total_orders_non_negative check (total_orders >= 0),
  constraint restaurants_rejection_reason_required check (status != 'rejected' or rejection_reason is not null),
  constraint restaurants_suspended_reason_required check (status != 'suspended' or suspended_reason is not null)
);

create index restaurants_owner_idx on public.restaurants (owner_id) where deleted_at is null;
create index restaurants_status_idx on public.restaurants (status) where deleted_at is null;
create index restaurants_city_idx on public.restaurants (city_id) where deleted_at is null;
-- Partial GIST index: only ever candidates for discovery when approved and
-- not soft-deleted, mirroring drivers_online_location_idx. The additional
-- "is_open AND holds an active subscription" conditions are checked in the
-- discovery RPC's WHERE clause (a live join, not indexable this way) —
-- same split used by ride matching (partial index on is_online+approved,
-- subscription checked separately in _find_eligible_drivers).
create index restaurants_approved_location_idx on public.restaurants using gist (location)
  where status = 'approved' and deleted_at is null;

create trigger set_updated_at
  before update on public.restaurants
  for each row execute function public.set_updated_at();

comment on table public.restaurants is 'A restaurant listing. status is the admin approval lifecycle; is_open is the owner''s own "currently accepting orders" toggle (mirrors drivers.is_online); an active restaurant_subscriptions row is the third independent condition — a restaurant is only actually orderable when all three hold, computed at query time, never denormalized into one flag.';

alter table public.restaurants enable row level security;

create policy "restaurants_select_own_owner" on public.restaurants
  for select using (
    exists (select 1 from public.restaurant_owners ro where ro.id = restaurants.owner_id and ro.id = auth.uid())
  );

create policy "restaurants_select_approved_public" on public.restaurants
  for select using (status = 'approved' and deleted_at is null);

create policy "restaurants_all_admin" on public.restaurants
  for all using (public.is_admin()) with check (public.is_admin());

-- New restaurants always start pending_verification — an owner cannot
-- insert a row claiming any other status (the column-protection trigger
-- below additionally blocks changing it afterward on their own UPDATEs).
create policy "restaurants_insert_own_owner" on public.restaurants
  for insert with check (
    owner_id = auth.uid()
    and status = 'pending_verification'
    and exists (select 1 from public.restaurant_owners ro where ro.id = auth.uid())
  );

create policy "restaurants_update_own_owner" on public.restaurants
  for update using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- protect_restaurant_system_columns() — same discipline as
-- protect_driver_system_columns() (20260808090000): RLS is row-level, not
-- column-level, so restaurants_update_own_owner above would otherwise let an
-- owner self-approve, clear a rejection, un-suspend themselves, or forge
-- their own rating/order-count. Approval/rating/order-count changes must
-- come from an admin session or a trusted SECURITY DEFINER RPC.
-- ----------------------------------------------------------------------------
create or replace function public.protect_restaurant_system_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('ride_it.trusted_write', true), 'false') = 'true'
     or public.is_admin() then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.rejection_reason is distinct from old.rejection_reason
     or new.suspended_reason is distinct from old.suspended_reason
     or new.rating is distinct from old.rating
     or new.total_ratings is distinct from old.total_ratings
     or new.total_orders is distinct from old.total_orders
     or new.owner_id is distinct from old.owner_id
  then
    raise exception 'Cannot modify protected restaurant fields directly' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_restaurant_system_columns on public.restaurants;
create trigger protect_restaurant_system_columns
  before update on public.restaurants
  for each row execute function public.protect_restaurant_system_columns();

comment on function public.protect_restaurant_system_columns() is
  'Blocks owner self-modification of status/rejection_reason/suspended_reason/rating/total_ratings/total_orders/owner_id. name, address, location, is_open, images, etc. remain owner-editable.';
