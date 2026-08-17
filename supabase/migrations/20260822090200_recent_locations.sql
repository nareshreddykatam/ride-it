-- ============================================================================
-- 20260822090200_recent_locations.sql
--
-- Part 9 — recent pickup/drop locations on the booking/search screen.
-- Deliberately a separate table from saved_places (not a "recent" flag on
-- saved_places): saved_places are explicit, user-curated, permanent
-- favorites; recent_locations are an implicit, auto-maintained history of
-- anywhere the passenger has actually searched/booked, capped and
-- deduplicated by address rather than hand-curated. Mirrors saved_places'
-- shape (passenger_id, address, geography point) and RLS pattern exactly.
-- ============================================================================

create table public.recent_locations (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.passengers (id) on delete cascade,
  label text,
  address text not null,
  location extensions.geography(Point, 4326) not null,
  place_id text,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint recent_locations_address_not_blank check (length(trim(address)) > 0)
);

-- Case-insensitive dedupe key: repeatedly selecting "Banjara Hills" and
-- "banjara hills" should update the same row, not create two.
create unique index recent_locations_passenger_address_idx
  on public.recent_locations (passenger_id, lower(address));

create index recent_locations_passenger_recency_idx
  on public.recent_locations (passenger_id, last_used_at desc);

alter table public.recent_locations enable row level security;

create policy "recent_locations_select_own" on public.recent_locations
  for select using (passenger_id = auth.uid());

create policy "recent_locations_all_admin" on public.recent_locations
  for all using (public.is_admin()) with check (public.is_admin());

comment on table public.recent_locations is 'Auto-maintained, deduplicated-by-address history of a passenger''s recent pickup/drop locations. Written only via upsert_recent_location() (SECURITY DEFINER) — no direct client INSERT/UPDATE policy, matching the same "narrow RPC over a broad write policy" pattern used for driver_documents.';

-- ----------------------------------------------------------------------------
-- upsert_recent_location — the sole write path. Updates last_used_at (and
-- refreshes label/location/place_id) on repeat selection of the same
-- address instead of inserting a duplicate row, then trims the caller's
-- history to the most recent 15 entries so it can't grow unbounded. 15
-- (not 10) leaves headroom above the "latest 5-10" the UI actually shows,
-- so a slightly-older-than-shown row isn't evicted the instant it scrolls
-- out of view.
-- ----------------------------------------------------------------------------
create or replace function public.upsert_recent_location(
  p_address text,
  p_lat double precision,
  p_lng double precision,
  p_label text default null,
  p_place_id text default null
)
returns public.recent_locations
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.recent_locations;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.passengers where id = auth.uid()) then
    raise exception 'Caller is not a registered passenger' using errcode = '42501';
  end if;

  if p_address is null or length(trim(p_address)) = 0 then
    raise exception 'Address is required' using errcode = '22023';
  end if;

  insert into public.recent_locations (passenger_id, label, address, location, place_id, last_used_at)
  values (auth.uid(), p_label, p_address, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography, p_place_id, now())
  on conflict (passenger_id, lower(address)) do update set
    label = coalesce(excluded.label, public.recent_locations.label),
    location = excluded.location,
    place_id = coalesce(excluded.place_id, public.recent_locations.place_id),
    last_used_at = now()
  returning * into v_row;

  delete from public.recent_locations
  where passenger_id = auth.uid()
    and id not in (
      select id from public.recent_locations
      where passenger_id = auth.uid()
      order by last_used_at desc
      limit 15
    );

  return v_row;
end;
$$;

revoke execute on function public.upsert_recent_location(text, double precision, double precision, text, text) from public;
grant execute on function public.upsert_recent_location(text, double precision, double precision, text, text) to authenticated;

comment on function public.upsert_recent_location(text, double precision, double precision, text, text) is
  'Sole write path for recent_locations. Dedupes by (passenger_id, lower(address)) — repeat selection bumps last_used_at instead of inserting a duplicate — and trims the caller''s own history to the most recent 15 rows. Structurally cannot write another passenger''s history (always auth.uid()).';
