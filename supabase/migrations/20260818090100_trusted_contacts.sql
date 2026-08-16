-- ============================================================================
-- 20260818090100_trusted_contacts.sql
-- Phase 13. A passenger's personal emergency contacts.
--
-- RLS deliberately has NO admin policy — same reasoning as Phase 10's
-- passenger_ride_pins: there is no legitimate operational need for an
-- Admin session to browse a passenger's personal contact list, and the
-- brief explicitly lists "accessing another user's emergency
-- information" as something to prevent. A real safety investigation
-- works from the safety_events/support_tickets record (which captures
-- what happened and where), not from reading someone's private address
-- book. If a future phase finds a genuine need for admin-assisted
-- contact recovery, that should be its own narrowly-scoped RPC, not
-- blanket table access — consistent with how provision_admin_user
-- (Phase 6.2) was built instead of giving admin direct write access to
-- auth-adjacent tables.
--
-- Soft-deleted (deleted_at), not hard-deleted — "trusted contact
-- added/removed" is one of the events item 14 explicitly wants
-- auditable; a soft-delete preserves that history on the row itself
-- without needing a separate audit log table for this one concern.
-- ============================================================================

create table public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.passengers (id) on delete cascade,
  name text not null,
  phone text not null,
  relationship_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint trusted_contacts_phone_format check (phone ~ '^[0-9]{10,15}$')
);

create index trusted_contacts_passenger_idx on public.trusted_contacts (passenger_id) where deleted_at is null;

create trigger set_updated_at
  before update on public.trusted_contacts
  for each row execute function public.set_updated_at();

comment on table public.trusted_contacts is 'A passenger''s personal emergency contacts. Owner-only access — no admin policy by design (see migration comment). Soft-deleted, not hard-deleted, to preserve an audit trail of additions/removals.';

alter table public.trusted_contacts enable row level security;

create policy "trusted_contacts_all_own" on public.trusted_contacts
  for all using (passenger_id = auth.uid()) with check (passenger_id = auth.uid());
