-- ============================================================================
-- 20260824090000_saved_places_recent_locations_coordinates.sql
--
-- Google Maps integration gap: saved_places.location and
-- recent_locations.location are PostGIS geography(Point,4326) columns,
-- but packages/data/src/saved-places.ts and recent-locations.ts never
-- select them (a raw `geography` value doesn't serialize to anything a
-- PostgREST client can use directly). The result: selecting a saved place
-- or recent location on the Search screen had no real coordinates to hand
-- to the booking flow at all — the client was hardcoding a fake distance
-- (`distanceKm=3`) and, for recordRecentLocation(), a hardcoded Vijayawada
-- center fallback coordinate, for every single selection, regardless of
-- the place's real stored location.
--
-- Fix: two PostgREST "computed column" functions per table (the standard,
-- documented Supabase/PostgREST idiom for exposing a geography column as
-- plain numbers — see https://postgrest.org/en/stable/references/api/computed_fields.html),
-- using the exact ST_X/ST_Y extraction already used elsewhere in this
-- schema for the identical problem (get_ride_tracking(), 20260814090000;
-- get_shared_ride_status(), 20260818090300) — not a new pattern, the same
-- one applied to two more tables.
--
-- Security: purely additive and read-only. A computed column function is
-- only ever invoked by PostgREST for rows the caller's existing RLS
-- policy (saved_places_select_own / recent_locations_select_own, both
-- unchanged) already allows them to see — this cannot expose any row, or
-- any column, a client couldn't already read.
--
-- CORRECTED BEFORE FIRST SUCCESSFUL APPLY: the initial version of this
-- file omitted `set search_path = public, extensions` on all four
-- functions, so the bare `geometry` type reference in `::geometry` failed
-- with `type "geometry" does not exist` (PostGIS types live in
-- `extensions`, not `public`) — caught by `supabase db push` itself,
-- which rolled the whole file back cleanly (nothing partially applied).
-- Fixed to match get_ride_tracking()'s existing search_path exactly.
-- ============================================================================

create or replace function public.saved_places_lat(public.saved_places)
returns double precision
language sql
stable
set search_path = public, extensions
as $$
  select ST_Y($1.location::geometry);
$$;

create or replace function public.saved_places_lng(public.saved_places)
returns double precision
language sql
stable
set search_path = public, extensions
as $$
  select ST_X($1.location::geometry);
$$;

comment on function public.saved_places_lat(public.saved_places) is
  'PostgREST computed column: saved_places.lat. Read-only extraction of the existing location geography column via ST_Y — introduces no new data, follows the same ST_X/ST_Y idiom as get_ride_tracking(). Selectable as ".../saved_places?select=...,lat,lng".';
comment on function public.saved_places_lng(public.saved_places) is
  'PostgREST computed column: saved_places.lng. See saved_places_lat() comment.';

revoke execute on function public.saved_places_lat(public.saved_places) from public;
grant execute on function public.saved_places_lat(public.saved_places) to authenticated;
revoke execute on function public.saved_places_lng(public.saved_places) from public;
grant execute on function public.saved_places_lng(public.saved_places) to authenticated;

create or replace function public.recent_locations_lat(public.recent_locations)
returns double precision
language sql
stable
set search_path = public, extensions
as $$
  select ST_Y($1.location::geometry);
$$;

create or replace function public.recent_locations_lng(public.recent_locations)
returns double precision
language sql
stable
set search_path = public, extensions
as $$
  select ST_X($1.location::geometry);
$$;

comment on function public.recent_locations_lat(public.recent_locations) is
  'PostgREST computed column: recent_locations.lat. Same idiom as saved_places_lat().';
comment on function public.recent_locations_lng(public.recent_locations) is
  'PostgREST computed column: recent_locations.lng. Same idiom as saved_places_lat().';

revoke execute on function public.recent_locations_lat(public.recent_locations) from public;
grant execute on function public.recent_locations_lat(public.recent_locations) to authenticated;
revoke execute on function public.recent_locations_lng(public.recent_locations) from public;
grant execute on function public.recent_locations_lng(public.recent_locations) to authenticated;
