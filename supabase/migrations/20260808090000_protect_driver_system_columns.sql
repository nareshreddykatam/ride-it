-- ============================================================================
-- 20260808090000_protect_driver_system_columns.sql
-- Phase 6.2 hardening, item 1.
--
-- Vulnerability: drivers_update_own (Phase 3) is `using (id = auth.uid())
-- with check (id = auth.uid())` — RLS is row-level, not column-level, so
-- this permits a driver to update ANY column on their own row via a direct
-- client call, including verification_status, rating, strike_count, and
-- total_rides. A driver could self-approve, set their own 5.0 rating, or
-- clear their own strikes. This was flagged as debt in the Phase 6.1
-- review; fixed properly here rather than left open.
--
-- Fix: a trigger, not a narrower RLS policy — RLS genuinely cannot express
-- "this row is editable, but only these columns" on its own. The trigger
-- rejects changes to protected columns UNLESS the write is either (a) from
-- an admin session, or (b) explicitly marked as a trusted system write by
-- one of our own SECURITY DEFINER functions (increment_driver_strike is
-- the one existing example — it legitimately needs to modify strike_count
-- as the driver's own, non-admin session).
--
-- is_online is deliberately NOT in the protected list — it stays
-- driver-editable, still gated by the Phase 6.1
-- enforce_driver_online_requires_subscription trigger, per your explicit
-- instruction to keep that mechanism as-is.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- _mark_trusted_write(): sets a transaction-local flag. Only ever called
-- from inside our own SECURITY DEFINER functions, never granted EXECUTE to
-- authenticated/anon — a client cannot call this directly to forge a
-- trusted write (and even if it somehow could, the flag is transaction-
-- local via set_config(..., true), so it wouldn't survive into a separate
-- REST call anyway, which is always its own transaction).
-- ----------------------------------------------------------------------------
create or replace function public._mark_trusted_write()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('ride_it.trusted_write', 'true', true); -- true = local to this transaction only
end;
$$;

revoke execute on function public._mark_trusted_write() from public;
revoke execute on function public._mark_trusted_write() from authenticated;
-- No grant to any client-facing role at all — internal use only.

comment on function public._mark_trusted_write() is
  'Internal only — never grant EXECUTE to authenticated/anon. Called by our own SECURITY DEFINER functions immediately before a write that would otherwise be rejected by protect_driver_system_columns().';

-- ----------------------------------------------------------------------------
-- The protection trigger itself.
-- ----------------------------------------------------------------------------
create or replace function public.protect_driver_system_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted system writes (our own RPCs) and real admin sessions bypass
  -- the check entirely.
  if coalesce(current_setting('ride_it.trusted_write', true), 'false') = 'true'
     or public.is_admin() then
    return new;
  end if;

  if new.verification_status is distinct from old.verification_status
     or new.rating is distinct from old.rating
     or new.strike_count is distinct from old.strike_count
     or new.total_rides is distinct from old.total_rides
  then
    raise exception 'Cannot modify protected driver fields directly' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_driver_system_columns on public.drivers;
create trigger protect_driver_system_columns
  before update on public.drivers
  for each row execute function public.protect_driver_system_columns();

comment on function public.protect_driver_system_columns() is
  'Blocks direct driver self-modification of verification_status/rating/strike_count/total_rides, regardless of write path (RLS alone cannot express column-level restriction). vehicle_type, current_city_id, current_location, and is_online remain driver-editable — is_online is separately gated by enforce_driver_online_requires_subscription (Phase 6.1), unchanged by this migration.';

-- ----------------------------------------------------------------------------
-- Update increment_driver_strike() to mark itself as a trusted write before
-- touching strike_count — otherwise the trigger above would now block its
-- own legitimate update.
-- ----------------------------------------------------------------------------
create or replace function public.increment_driver_strike()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  perform public._mark_trusted_write();

  update public.drivers
  set strike_count = strike_count + 1
  where id = auth.uid();
end;
$$;

comment on function public.increment_driver_strike() is
  'Atomically increments the calling driver''s own strike_count by 1. Marks itself as a trusted write (Phase 6.2) so protect_driver_system_columns permits this specific, narrow, audited mutation.';
