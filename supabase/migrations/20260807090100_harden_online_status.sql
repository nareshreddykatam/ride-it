-- ============================================================================
-- 20260807090100_harden_online_status.sql
-- Phase 6.1 security hardening, item 2.
--
-- Vulnerability: "no active subscription = can't go online" was enforced
-- only in the Driver Dashboard's button handler (a client-side guard). Any
-- direct call to `supabase.from('drivers').update({ is_online: true })`
-- (drivers_update_own already permits a driver to update their own row)
-- would bypass it entirely.
--
-- Fix: a BEFORE UPDATE trigger on `drivers` that blocks the false->true
-- transition of is_online unless an active, unexpired subscription exists.
-- A trigger (not an RPC) is used specifically because it protects the
-- column regardless of which write path is used — the existing
-- setDriverOnlineStatus() client call, a future RPC, or a raw REST call —
-- rather than only closing the one path this phase happens to use.
-- ============================================================================

create or replace function public.enforce_driver_online_requires_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only checked on the false/null -> true transition. Already-online
  -- drivers re-saving other fields, or a driver going offline, are never
  -- blocked by this — the rule is "you can't switch ON without a
  -- subscription", not "you must continuously hold one every second".
  if new.is_online = true and coalesce(old.is_online, false) = false then
    if not exists (
      select 1 from public.subscriptions
      where driver_id = new.id
        and status = 'active'
        and expires_at > now()
    ) then
      raise exception 'Cannot go online without an active subscription' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_online_requires_subscription on public.drivers;
create trigger enforce_online_requires_subscription
  before update of is_online on public.drivers
  for each row execute function public.enforce_driver_online_requires_subscription();

comment on function public.enforce_driver_online_requires_subscription() is
  'Database-level enforcement of "active subscription required to go online" — independent of the Driver Dashboard''s existing client-side guard, which remains as the normal UX path but is no longer the only thing preventing this.';
