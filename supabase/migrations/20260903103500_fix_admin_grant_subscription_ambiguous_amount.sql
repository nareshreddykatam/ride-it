-- ============================================================================
-- 20260903103500_fix_admin_grant_subscription_ambiguous_amount.sql
--
-- Bug found via live end-to-end testing of admin_grant_driver_subscription()
-- (20260903103000): granting a subscription failed with a real Postgres
-- error, "column reference \"amount\" is ambiguous", raised on the EXTEND
-- branch's `amount = amount + v_amount` assignment.
--
-- Root cause: the function's RETURNS TABLE(...) list declares OUT columns
-- named plan/status/starts_at/expires_at/amount — these are implicitly
-- plpgsql variables in scope for the ENTIRE function body, not just the
-- final `return query`. Every one of those names is also a real column on
-- public.subscriptions/subscription_plans, so any unqualified reference to
-- them inside the function is genuinely ambiguous between "the OUT
-- variable" and "the table column". The extend branch's bare `amount`
-- happened to be the one exercised by a real grant call; the same
-- ambiguity was latent in several other unqualified references throughout
-- the function (the subscription_plans lookup, the existing-row lookup,
-- the plain UPDATE/SET statements) even though they hadn't yet been hit by
-- a code path that surfaced an error.
--
-- Fix: qualify every reference to a subscriptions/subscription_plans
-- column with a table alias throughout the function body. No parameter,
-- return shape, authorization check, or business logic changes — this is
-- purely resolving the ambiguity, re-verified by repeating the same live
-- grant that originally failed (now succeeds and returns the expected
-- row).
-- ============================================================================

create or replace function public.admin_grant_driver_subscription(
  p_driver_id uuid,
  p_plan public.subscription_plan_enum,
  p_reason text default null
)
returns table (
  subscription_id uuid,
  plan public.subscription_plan_enum,
  status public.subscription_status_enum,
  starts_at timestamptz,
  expires_at timestamptz,
  amount numeric,
  action text,
  previous_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_amount numeric(10, 2);
  v_duration_days integer;
  v_existing public.subscriptions%rowtype;
  v_action text;
  v_previous_expires_at timestamptz;
  v_new_starts_at timestamptz;
  v_new_expires_at timestamptz;
  v_subscription_id uuid;
begin
  if v_admin_id is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not public.is_admin() then
    raise exception 'Only an admin can grant subscriptions' using errcode = '42501';
  end if;

  if p_driver_id is null then
    raise exception 'driver_id is required' using errcode = '22023';
  end if;

  if not exists (select 1 from public.drivers d where d.id = p_driver_id) then
    raise exception 'Driver not found' using errcode = 'P0002';
  end if;

  select sp.amount, sp.duration_days into v_amount, v_duration_days
  from public.subscription_plans sp
  where sp.plan = p_plan and sp.is_active = true;

  if v_amount is null then
    raise exception 'Invalid or inactive plan: %', p_plan using errcode = '22023';
  end if;

  -- Lock this driver's active row (if any) for the duration of this
  -- transaction — see 20260903103000's concurrency note.
  select * into v_existing
  from public.subscriptions s
  where s.driver_id = p_driver_id and s.status = 'active' and s.deleted_at is null
  for update;

  if found and v_existing.expires_at > now() then
    v_action := 'extend';
    v_previous_expires_at := v_existing.expires_at;
    v_new_starts_at := v_existing.starts_at;
    v_new_expires_at := v_existing.expires_at + (v_duration_days || ' days')::interval;

    update public.subscriptions s
    set plan = p_plan,
        amount = s.amount + v_amount,
        expires_at = v_new_expires_at,
        granted_by = v_admin_id,
        grant_reason = coalesce(p_reason, s.grant_reason)
    where s.id = v_existing.id
    returning s.id into v_subscription_id;
  else
    v_action := 'grant';
    v_previous_expires_at := case when found then v_existing.expires_at else null end;
    v_new_starts_at := now();
    v_new_expires_at := now() + (v_duration_days || ' days')::interval;

    if found then
      update public.subscriptions s set status = 'expired' where s.id = v_existing.id;
    end if;

    insert into public.subscriptions (driver_id, plan, status, amount, starts_at, expires_at, granted_by, grant_reason)
    values (p_driver_id, p_plan, 'active', v_amount, v_new_starts_at, v_new_expires_at, v_admin_id, p_reason)
    returning id into v_subscription_id;
  end if;

  insert into public.admin_subscription_actions (
    admin_id, driver_id, subscription_id, action, plan, duration_days, amount,
    previous_expires_at, new_expires_at, reason
  ) values (
    v_admin_id, p_driver_id, v_subscription_id, v_action, p_plan, v_duration_days, v_amount,
    v_previous_expires_at, v_new_expires_at, p_reason
  );

  return query
    select s.id, s.plan, s.status, s.starts_at, s.expires_at, s.amount, v_action, v_previous_expires_at
    from public.subscriptions s
    where s.id = v_subscription_id;
end;
$$;

comment on function public.admin_grant_driver_subscription(uuid, public.subscription_plan_enum, text) is
  'Admin-only (is_admin() enforced inside the function, not just at the RLS/UI layer) grant/extend of a driver subscription. Amount and duration always come from subscription_plans, never from the client. Grant vs. extend, start date, and expiry are all decided server-side from the driver''s actual current subscription row, locked FOR UPDATE to make concurrent admin actions on the same driver safe. Every call is recorded in admin_subscription_actions. Every subscriptions/subscription_plans column reference is table-aliased (20260903103500) to avoid ambiguity with this function''s own RETURNS TABLE OUT parameter names.';
