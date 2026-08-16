-- ============================================================================
-- supabase-compat-shim.sql
-- Phase 12. NOT a Ride It migration — never applied to a real Supabase
-- project, never counted as part of the 43-migration history. This
-- exists solely so the REAL migration chain can be executed against a
-- bare local PostgreSQL 16 + PostGIS install (this sandbox has no
-- Docker, so the full `supabase start` stack — GoTrue, PostgREST,
-- Realtime server — is unavailable; see PHASE_12_REAL_ENVIRONMENT_INTEGRATION_REVIEW.md
-- for the exact blocker).
--
-- This script recreates ONLY the handful of things a real Supabase
-- project already has in place before any application migration ever
-- runs: the anon/authenticated/service_role roles, an `auth` schema with
-- a minimal `auth.users` table (our migrations FK into it) and
-- `auth.uid()`/`auth.role()` functions, the `extensions` schema, and an
-- empty `supabase_realtime` publication. It does NOT reimplement GoTrue,
-- PostgREST, or the Realtime server — there is no real HTTP auth flow,
-- no real session JWT issuance, and no real websocket delivery here.
--
-- auth.uid()/auth.role() are implemented against `request.jwt.claims`
-- (a session-local Postgres setting), the same mechanism PostgREST uses
-- to pass the caller's JWT claims into a Postgres session for a real
-- Supabase project. Using `SET LOCAL request.jwt.claims = '...'` + `SET
-- LOCAL role authenticated` inside a transaction genuinely, correctly
-- simulates an authenticated Postgres session as far as RLS enforcement
-- is concerned — this is a well-established local-testing technique, and
-- RLS policies evaluated this way behave identically to how they would
-- against a real session's JWT-derived claims. What is NOT verified by
-- this shim: that a real Supabase project's actual GoTrue-issued JWT
-- looks exactly like what's constructed here, or that PostgREST forwards
-- claims in precisely this format in every version — reasoned to match
-- Supabase's well-documented, stable convention, not independently
-- confirmed against a live GoTrue instance.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Minimal Storage schema stub. FOUND AS A REAL BLOCKER while running the
-- migration chain against this shim: migration 20260806090000 references
-- storage.buckets/storage.objects, which belong to Supabase's separate
-- Storage service (its own product, not core Postgres) — not available
-- without the full Docker-based `supabase start` stack (unavailable in
-- this sandbox, see the Phase 12 review doc).
--
-- This stub approximates Supabase's own published, stable Storage schema
-- (bucket id/name/public on storage.buckets; bucket_id/name/owner on
-- storage.objects; storage.foldername() splitting the object path on
-- '/') closely enough for our migration's bucket INSERT and RLS policies
-- to apply and be exercised for real against real Postgres RLS — but
-- it is NOT the real Supabase Storage service. No actual file upload/
-- download API exists here; only the RLS policy logic itself is tested.
-- Placed after role creation below since its own grants target those roles.
-- ----------------------------------------------------------------------------

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

grant anon to postgres;
grant authenticated to postgres;
grant service_role to postgres;

create schema storage;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable
as $$
  select string_to_array(name, '/');
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;

create schema if not exists auth;
create schema if not exists extensions;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  phone text,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'anon');
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;

create publication supabase_realtime;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to service_role;

-- ----------------------------------------------------------------------------
-- REAL FINDING from actually running the migration chain against this
-- shim (not caught by six phases of static review): a `LANGUAGE SQL`
-- function's body is parsed and its identifiers resolved using the
-- SESSION's ambient search_path active at CREATE FUNCTION time, NOT the
-- function's own `SET search_path` clause (that override only takes
-- effect once the function actually executes, not while Postgres is
-- validating/registering its body). `_find_eligible_drivers()`
-- (migration 20260813090300) failed to even CREATE against a bare
-- Postgres instance with the plain `"$user", public` default, because
-- `ST_Distance` isn't resolvable without `extensions` already being on
-- the ambient path.
--
-- CORRECTED, post-real-deployment: this comment originally claimed "a
-- real Supabase project sets its database-level default search_path to
-- include extensions from the start" as the explanation for why Ride
-- It's own migrations didn't need to handle this themselves. That claim
-- was an unverified assumption, and a real `supabase db push` against
-- the actual Ride It Supabase project proved it FALSE — the real project
-- failed at this exact function with this exact error. The actual fix
-- now lives directly in 20260813090300_matching_engine.sql's function
-- definition (explicit `search_path = public, extensions` on the
-- function itself, not relied on from the database's ambient default).
-- This harness's own ALTER DATABASE workaround below is kept as a
-- convenience for local testing (harmless, and it means a future
-- migration that makes the same mistake would still surface a real
-- CREATE-time error locally rather than being silently masked at the
-- database level) — but it is no longer load-bearing for this specific
-- fix, and should not be read as "this is what real Supabase does by
-- default." It isn't known to, for this project.
-- ----------------------------------------------------------------------------
-- REAL BUG FOUND while validating this shim against a second, differently-
-- named database: this statement originally hardcoded 'rideit_test' (the
-- database used for this phase's manual testing), which meant it silently
-- did nothing against any other database — including whatever database
-- the CI workflow (.github/workflows/ci.yml) actually connects to. Fixed
-- with dynamic SQL targeting current_database() so this shim works
-- correctly regardless of what the database is named.
do $$
begin
  execute format('alter database %I set search_path to "$user", public, extensions', current_database());
end;
$$;

-- Matches a real Supabase project's default grants: anon/authenticated
-- get broad table-level GRANTs (SELECT/INSERT/UPDATE/DELETE), with RLS —
-- not table-level permissions — doing the actual restricting. Without
-- this, Postgres denies access at the table-permission check before RLS
-- policies ever get evaluated, which would make every RLS test against
-- this harness fail for the wrong reason (missing GRANT, not RLS logic).
grant all on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
