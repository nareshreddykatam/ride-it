-- ============================================================================
-- 20260907090000_driver_online_requires_approval.sql
--
-- Found during the production driver-lifecycle audit: enforce_driver_online_
-- requires_subscription() (20260807090100) only checks for an active
-- subscription before allowing is_online false -> true. It never checks
-- drivers.verification_status. A driver who somehow holds an active
-- subscription (e.g. an admin grant issued ahead of document review) but
-- whose verification is still 'pending'/'in_review', or who has been
-- 'rejected'/'suspended', could set is_online = true and receive ride
-- offers despite never having been approved — the DB-level "can this driver
-- actually operate" check was incomplete.
--
-- This is additive to the existing subscription check, not a replacement —
-- both must hold for the false -> true transition. Same trigger, same
-- narrow "only checked on the actual transition" scope as before.
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
  -- blocked by this — the rule is "you can't switch ON without being
  -- approved and holding a subscription", not "you must continuously hold
  -- both every second".
  if new.is_online = true and coalesce(old.is_online, false) = false then
    if new.verification_status != 'approved' then
      raise exception 'Cannot go online — driver verification is not approved' using errcode = 'P0001';
    end if;

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

comment on function public.enforce_driver_online_requires_subscription() is
  'Blocks the is_online false->true transition unless the driver is both verification_status=approved AND holds an active, unexpired subscription (20260907: added the approval check, which was previously missing — only subscription was enforced).';
