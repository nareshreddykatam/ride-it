-- ============================================================================
-- 0001_extensions_and_utility_functions.sql
-- Extensions and shared trigger function used by every table in this schema.
-- ============================================================================

-- pgcrypto — gen_random_uuid() for UUID primary keys.
create extension if not exists pgcrypto with schema extensions;

-- postgis — geography(Point,4326) columns for driver location and ride
-- pickup/drop, plus GIST indexes for efficient "nearest driver" queries.
-- Must be enabled on the Supabase project (Database > Extensions) if not
-- already; this statement is a no-op if it already is.
create extension if not exists postgis with schema extensions;

-- ----------------------------------------------------------------------------
-- set_updated_at(): generic trigger function attached to every table with an
-- `updated_at` column. Keeps "updated_at" accurate without relying on the
-- application layer to remember to set it on every write.
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger function: sets updated_at = now() on every row UPDATE. Attached per-table via "trigger set_updated_at before update".';
