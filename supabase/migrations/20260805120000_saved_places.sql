-- ============================================================================
-- 20260805120000_saved_places.sql
-- Phase 5 addition. Not part of the original 20-table list from Phase 3 —
-- "saved places" wasn't a named table there, but is an explicit Phase 5
-- requirement with no existing table to back it. Same reasoning as
-- admin_role_permissions in Phase 3: additive, compelling, documented here
-- rather than silently added.
-- ============================================================================

create table public.saved_places (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.passengers (id) on delete cascade,
  label text not null,
  address text not null,
  location extensions.geography(Point, 4326) not null,
  icon text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint saved_places_label_not_blank check (length(trim(label)) > 0)
);

create index saved_places_passenger_idx on public.saved_places (passenger_id) where deleted_at is null;

create trigger set_updated_at
  before update on public.saved_places
  for each row execute function public.set_updated_at();

comment on table public.saved_places is 'Passenger-saved locations (Home, Work, etc.) for quick destination selection. Owner-only via RLS below.';

alter table public.saved_places enable row level security;

create policy "saved_places_select_own" on public.saved_places
  for select using (passenger_id = auth.uid());

create policy "saved_places_insert_own" on public.saved_places
  for insert with check (passenger_id = auth.uid());

create policy "saved_places_update_own" on public.saved_places
  for update using (passenger_id = auth.uid()) with check (passenger_id = auth.uid());

create policy "saved_places_delete_own" on public.saved_places
  for delete using (passenger_id = auth.uid());

create policy "saved_places_all_admin" on public.saved_places
  for all using (public.is_admin()) with check (public.is_admin());
