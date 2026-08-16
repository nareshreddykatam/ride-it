-- ============================================================================
-- 20260812090000_admin_verification_notes.sql
-- Phase 7 addition. The Admin Driver Detail screen needs somewhere to record
-- *why* a driver was approved/rejected/suspended at the driver level (the
-- existing driver_documents.rejection_reason is per-document, not
-- driver-level). Small, additive column — not a redesign of the
-- verification model.
--
-- Protected by the same protect_driver_system_columns() trigger
-- (Phase 6.2) as verification_status/rating/strike_count/total_rides — a
-- driver must not be able to write their own "official" verification
-- notes any more than they can set their own verification_status.
-- ============================================================================

alter table public.drivers add column verification_notes text;

comment on column public.drivers.verification_notes is 'Admin-authored note explaining the current verification_status (e.g. rejection reason). Protected by protect_driver_system_columns() — drivers cannot set this themselves.';

-- Extend the existing trigger function to also protect this new column.
-- CREATE OR REPLACE, same function/trigger names as Phase 6.2 — this is an
-- amendment, not a new mechanism.
create or replace function public.protect_driver_system_columns()
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

  if new.verification_status is distinct from old.verification_status
     or new.rating is distinct from old.rating
     or new.strike_count is distinct from old.strike_count
     or new.total_rides is distinct from old.total_rides
     or new.verification_notes is distinct from old.verification_notes
  then
    raise exception 'Cannot modify protected driver fields directly' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.protect_driver_system_columns() is 'Blocks direct driver self-modification of verification_status/rating/strike_count/total_rides/verification_notes, regardless of write path. is_online remains driver-editable, gated separately by enforce_driver_online_requires_subscription (Phase 6.1). Phase 7 added verification_notes to the protected set.';
