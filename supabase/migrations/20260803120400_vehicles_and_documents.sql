-- ============================================================================
-- 0005_vehicles_and_documents.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- vehicles — kept separate from `drivers` rather than inlining registration
-- fields there, because a driver can register a replacement vehicle over
-- time and history (old vehicle, old registration) should be preserved for
-- audit rather than overwritten in place.
-- ----------------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  vehicle_type public.vehicle_type_enum not null,
  registration_number text not null,
  make text,
  model text,
  manufacture_year smallint,
  color text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint vehicles_registration_number_unique unique (registration_number),
  constraint vehicles_manufacture_year_range
    check (manufacture_year is null or manufacture_year between 1990 and extract(year from now())::smallint + 1)
);

create index vehicles_driver_idx on public.vehicles (driver_id);
-- A driver should have exactly one *active* vehicle at a time (the one used
-- for ride matching); history of previous vehicles stays via is_active = false.
create unique index vehicles_one_active_per_driver_idx
  on public.vehicles (driver_id) where is_active = true and deleted_at is null;

create trigger set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

comment on table public.vehicles is 'A driver''s registered vehicle(s). Only one may be is_active at a time (enforced by partial unique index) — history of prior vehicles is preserved, not overwritten.';

-- ----------------------------------------------------------------------------
-- driver_documents — one row per (driver, document_type) currently on file.
-- Re-uploads after a rejection are modeled as a NEW row (old one
-- soft-deleted) rather than overwriting file_path in place, so the
-- rejection history admins reviewed is never lost.
-- ----------------------------------------------------------------------------
create table public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  document_type public.document_type_enum not null,
  file_path text not null, -- Supabase Storage object path, e.g. "driver-documents/<driver_id>/aadhaar.pdf"
  status public.document_status_enum not null default 'pending',
  rejection_reason text,
  reviewed_by uuid references public.admin_users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint driver_documents_rejection_reason_required
    check (status != 'rejected' or rejection_reason is not null)
);

create index driver_documents_driver_idx on public.driver_documents (driver_id);
create index driver_documents_status_idx on public.driver_documents (status) where deleted_at is null;
-- One *current* document per (driver, type) — re-uploads soft-delete the
-- previous row first rather than violating this.
create unique index driver_documents_one_current_per_type_idx
  on public.driver_documents (driver_id, document_type) where deleted_at is null;

create trigger set_updated_at
  before update on public.driver_documents
  for each row execute function public.set_updated_at();

comment on table public.driver_documents is 'KYC documents per driver. file_path points into Supabase Storage (private bucket) — see packages/supabase/src/storage.ts. Rejected documents require a rejection_reason.';
