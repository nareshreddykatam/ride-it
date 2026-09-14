-- ============================================================================
-- 20260914090200_restaurant_verification_and_categories.sql
-- Ridora Food Phase 1.
--
-- restaurant_verification: kept deliberately minimal per the brief ("do not
-- invent legal requirements as facts" — no FSSAI/GST/PAN field is asserted
-- as required here, since that's a jurisdiction/product decision this
-- schema shouldn't hardcode). business_license_number is a single optional
-- free-text field; additional_info jsonb is the extension point for
-- whatever specific KYC fields Admin decides to require later, without a
-- schema migration for each one — this is the one place in the Food schema
-- JSON is used for genuinely flexible data, not core relational fields.
--
-- food_categories is a lookup table (Biryani, South Indian, ...), not an
-- enum — same reasoning as admin_roles (0003): the vocabulary is expected
-- to grow via Admin, not via a schema migration. restaurant_categories is
-- the many-to-many join (a restaurant can carry more than one cuisine tag).
-- ============================================================================

create table public.restaurant_verification (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants (id) on delete cascade,
  business_license_number text,
  additional_info jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.admin_users (id) on delete set null,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index restaurant_verification_restaurant_idx on public.restaurant_verification (restaurant_id);

create trigger set_updated_at
  before update on public.restaurant_verification
  for each row execute function public.set_updated_at();

comment on table public.restaurant_verification is 'Onboarding/KYC detail for one restaurant. additional_info is a deliberate JSON extension point for future verification fields Admin may require, without a schema migration per field.';

alter table public.restaurant_verification enable row level security;

create policy "restaurant_verification_select_own_owner" on public.restaurant_verification
  for select using (
    exists (select 1 from public.restaurants r where r.id = restaurant_verification.restaurant_id and r.owner_id = auth.uid())
  );

create policy "restaurant_verification_insert_own_owner" on public.restaurant_verification
  for insert with check (
    exists (select 1 from public.restaurants r where r.id = restaurant_verification.restaurant_id and r.owner_id = auth.uid())
  );

create policy "restaurant_verification_update_own_owner" on public.restaurant_verification
  for update using (
    exists (select 1 from public.restaurants r where r.id = restaurant_verification.restaurant_id and r.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.restaurants r where r.id = restaurant_verification.restaurant_id and r.owner_id = auth.uid())
  );

create policy "restaurant_verification_all_admin" on public.restaurant_verification
  for all using (public.is_admin()) with check (public.is_admin());

-- protect reviewed_at/reviewed_by/review_notes from owner self-edit — same
-- pattern as protect_restaurant_system_columns, scoped to this table.
create or replace function public.protect_restaurant_verification_review_columns()
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

  if new.reviewed_at is distinct from old.reviewed_at
     or new.reviewed_by is distinct from old.reviewed_by
     or new.review_notes is distinct from old.review_notes
  then
    raise exception 'Cannot modify review fields directly' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_restaurant_verification_review_columns on public.restaurant_verification;
create trigger protect_restaurant_verification_review_columns
  before update on public.restaurant_verification
  for each row execute function public.protect_restaurant_verification_review_columns();

-- ----------------------------------------------------------------------------
-- food_categories
-- ----------------------------------------------------------------------------
create table public.food_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  icon text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index food_categories_active_order_idx on public.food_categories (display_order) where is_active = true;

create trigger set_updated_at
  before update on public.food_categories
  for each row execute function public.set_updated_at();

comment on table public.food_categories is 'Admin-managed cuisine/discovery tags (Biryani, South Indian, ...) — a lookup table, not an enum, so the vocabulary can grow without a schema migration.';

alter table public.food_categories enable row level security;

create policy "food_categories_select_all" on public.food_categories
  for select using (true);

create policy "food_categories_all_admin" on public.food_categories
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.food_categories (name, slug, display_order) values
  ('Biryani', 'biryani', 1),
  ('South Indian', 'south-indian', 2),
  ('North Indian', 'north-indian', 3),
  ('Chinese', 'chinese', 4),
  ('Fast Food', 'fast-food', 5),
  ('Pizza', 'pizza', 6),
  ('Burgers', 'burgers', 7),
  ('Desserts', 'desserts', 8),
  ('Beverages', 'beverages', 9),
  ('Healthy', 'healthy', 10),
  ('Snacks', 'snacks', 11)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- restaurant_categories — many-to-many join.
-- ----------------------------------------------------------------------------
create table public.restaurant_categories (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  category_id uuid not null references public.food_categories (id) on delete restrict,
  primary key (restaurant_id, category_id)
);

create index restaurant_categories_category_idx on public.restaurant_categories (category_id);

comment on table public.restaurant_categories is 'Many-to-many: a restaurant can carry more than one cuisine/discovery tag.';

alter table public.restaurant_categories enable row level security;

create policy "restaurant_categories_select_all" on public.restaurant_categories
  for select using (true);

create policy "restaurant_categories_manage_own_owner" on public.restaurant_categories
  for all using (
    exists (select 1 from public.restaurants r where r.id = restaurant_categories.restaurant_id and r.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.restaurants r where r.id = restaurant_categories.restaurant_id and r.owner_id = auth.uid())
  );

create policy "restaurant_categories_all_admin" on public.restaurant_categories
  for all using (public.is_admin()) with check (public.is_admin());
