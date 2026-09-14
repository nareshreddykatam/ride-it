-- ============================================================================
-- 20260914090300_restaurant_menu.sql
-- Ridora Food Phase 1. Menu hierarchy: restaurant -> menu category -> item.
-- ============================================================================

create table public.restaurant_menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_menu_categories_unique_name unique (restaurant_id, name)
);

create index restaurant_menu_categories_restaurant_idx on public.restaurant_menu_categories (restaurant_id, display_order);

create trigger set_updated_at
  before update on public.restaurant_menu_categories
  for each row execute function public.set_updated_at();

comment on table public.restaurant_menu_categories is 'Owner-defined menu sections for one restaurant (e.g. "Biryani", "Starters", "Drinks") — free text per restaurant, distinct from the platform-wide food_categories discovery tags.';

alter table public.restaurant_menu_categories enable row level security;

create policy "restaurant_menu_categories_select_public" on public.restaurant_menu_categories
  for select using (
    is_active = true
    and exists (select 1 from public.restaurants r where r.id = restaurant_menu_categories.restaurant_id and r.status = 'approved' and r.deleted_at is null)
  );

create policy "restaurant_menu_categories_manage_own_owner" on public.restaurant_menu_categories
  for all using (
    exists (select 1 from public.restaurants r where r.id = restaurant_menu_categories.restaurant_id and r.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.restaurants r where r.id = restaurant_menu_categories.restaurant_id and r.owner_id = auth.uid())
  );

create policy "restaurant_menu_categories_all_admin" on public.restaurant_menu_categories
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- restaurant_menu_items
--
-- restaurant_id is denormalized from category_id.restaurant_id (validated
-- by the trigger below) purely so RLS/queries here don't need a join
-- through restaurant_menu_categories for the common "all items for this
-- restaurant" access check — the same denormalization style used by
-- subscription_payments.driver_id.
-- ----------------------------------------------------------------------------
create table public.restaurant_menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  category_id uuid not null references public.restaurant_menu_categories (id) on delete restrict,
  name text not null,
  description text,
  price numeric(10, 2) not null,
  veg_type public.food_veg_type_enum not null default 'veg',
  image_path text,
  is_available boolean not null default true,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_menu_items_price_positive check (price > 0)
);

create index restaurant_menu_items_restaurant_idx on public.restaurant_menu_items (restaurant_id) where is_active = true;
create index restaurant_menu_items_category_idx on public.restaurant_menu_items (category_id, display_order);

create trigger set_updated_at
  before update on public.restaurant_menu_items
  for each row execute function public.set_updated_at();

comment on table public.restaurant_menu_items is 'A single dish/item on a restaurant''s menu. is_available toggles "sold out today"; is_active is the owner''s soft-disable. Never mutated by an order — food_order_items snapshots name/price/veg_type at order time so historical orders are unaffected by later menu edits.';

-- ----------------------------------------------------------------------------
-- validate_menu_item_category() — a CHECK constraint cannot look up another
-- table, so a trigger enforces that category_id actually belongs to
-- restaurant_id, keeping the denormalized restaurant_id column honest.
-- ----------------------------------------------------------------------------
create or replace function public.validate_menu_item_category()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.restaurant_menu_categories c
    where c.id = new.category_id and c.restaurant_id = new.restaurant_id
  ) then
    raise exception 'category_id does not belong to restaurant_id' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger validate_menu_item_category
  before insert or update on public.restaurant_menu_items
  for each row execute function public.validate_menu_item_category();

alter table public.restaurant_menu_items enable row level security;

create policy "restaurant_menu_items_select_public" on public.restaurant_menu_items
  for select using (
    is_active = true
    and exists (select 1 from public.restaurants r where r.id = restaurant_menu_items.restaurant_id and r.status = 'approved' and r.deleted_at is null)
  );

create policy "restaurant_menu_items_manage_own_owner" on public.restaurant_menu_items
  for all using (
    exists (select 1 from public.restaurants r where r.id = restaurant_menu_items.restaurant_id and r.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.restaurants r where r.id = restaurant_menu_items.restaurant_id and r.owner_id = auth.uid())
  );

create policy "restaurant_menu_items_all_admin" on public.restaurant_menu_items
  for all using (public.is_admin()) with check (public.is_admin());
