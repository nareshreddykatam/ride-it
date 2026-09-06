-- ============================================================================
-- 20260903103000_admin_subscription_grants.sql
--
-- Admin Console feature: an authorized admin grants/extends a driver's
-- subscription directly (no Razorpay payment involved) — e.g. a
-- promotional grant, a support gesture, or a manually-reconciled payment
-- taken outside the app. Follows the same discipline the real driver
-- purchase path already uses (create_pending_subscription_payment /
-- mark_subscription_payment_captured, 20260816090300 — the successor to
-- the now-dropped purchase_subscription_simulated): a narrow SECURITY
-- DEFINER RPC that looks up amount/duration from subscription_plans
-- (never trusts a client-supplied number), rather than a general
-- client-writable INSERT/UPDATE policy on subscriptions — even though
-- subscriptions_all_admin's RLS already technically permits an admin
-- session to write that table directly, this keeps the same "narrow RPC,
-- not a broad write policy" discipline the rest of this schema already
-- uses for subscription issuance.
--
-- One deliberate difference from the driver purchase path: a real
-- purchase always starts a brand-new period from now() and expires
-- whatever was active before it (mark_subscription_payment_captured never
-- extends). This feature's brief explicitly asks for "current expiry +
-- new duration" when extending an already-active subscription (so an
-- early admin top-up doesn't discard time already granted) — see the
-- function body below for exactly where that diverges.
--
-- Two additive, non-breaking schema changes:
--
-- 1. subscriptions gains granted_by/grant_reason — nullable, so every
--    existing row (all driver-self-purchased via
--    purchase_subscription_simulated) is unaffected and reads as
--    "not admin-granted" (granted_by is null). This is what lets the
--    Admin UI show "Granted by <admin>" on the CURRENT subscription
--    without a join to the audit table.
--
-- 2. admin_subscription_actions — a dedicated, admin-readable-only audit
--    log. Deliberately separate from subscription_payments: an
--    admin-granted subscription involves no real payment (Phase 15 of the
--    brief — do not fabricate a Razorpay/UPI payment record for money that
--    never moved), so subscription_payments is not touched by this
--    feature at all. This table is INSERT-only via the RPC below (running
--    SECURITY DEFINER, so it bypasses RLS for its own write) — no role,
--    including admin, has a direct INSERT/UPDATE/DELETE policy on it, so
--    the audit trail cannot be edited after the fact even by an admin
--    session.
-- ============================================================================

alter table public.subscriptions
  add column granted_by uuid references public.users (id),
  add column grant_reason text;

comment on column public.subscriptions.granted_by is 'Admin (public.users.id) who granted/last extended this subscription via admin_grant_driver_subscription(). Null for a driver''s own purchase_subscription_simulated() purchase.';
comment on column public.subscriptions.grant_reason is 'Optional admin-authored note for why this subscription was granted/extended. Null for a driver''s own purchase.';

create table public.admin_subscription_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users (id),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  action text not null check (action in ('grant', 'extend')),
  plan public.subscription_plan_enum not null,
  duration_days integer not null,
  amount numeric(10, 2) not null,
  previous_expires_at timestamptz,
  new_expires_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now()
);

create index admin_subscription_actions_driver_idx on public.admin_subscription_actions (driver_id, created_at desc);
create index admin_subscription_actions_admin_idx on public.admin_subscription_actions (admin_id, created_at desc);

comment on table public.admin_subscription_actions is 'Immutable audit log of every admin-initiated subscription grant/extend. Written only by admin_grant_driver_subscription() (SECURITY DEFINER) — no role has a direct write policy, so this cannot be edited after the fact, including by admins.';

alter table public.admin_subscription_actions enable row level security;

create policy "admin_subscription_actions_select_admin" on public.admin_subscription_actions
  for select using (public.is_admin());

-- ----------------------------------------------------------------------------
-- admin_grant_driver_subscription(p_driver_id, p_plan, p_reason)
--
-- The client sends only: which driver, which plan, an optional reason.
-- Amount and duration are looked up from subscription_plans (same as
-- purchase_subscription_simulated) — there is no parameter through which a
-- client could influence amount, start date, expiry date, or status.
--
-- Grant vs. extend is decided server-side from the driver's actual current
-- subscription state, never from a client hint:
--   - No active, non-expired row for this driver -> GRANT: a fresh
--     subscription starting at the server's now(), expiring
--     now() + plan.duration_days. Any stale row still marked 'active' past
--     its own expires_at (the periodic expiry sweep hasn't caught it yet)
--     is expired first, mirroring purchase_subscription_simulated's own
--     "expire the old one before inserting" approach.
--   - An active, non-expired row exists -> EXTEND: expires_at becomes
--     THAT ROW's existing expires_at + plan.duration_days (never
--     now() + duration, which would silently discard time the driver was
--     already granted) — the "extending early costs nothing" rule
--     documented in the feature brief. amount accumulates (existing +
--     newly-granted plan amount) since the row now represents the total
--     value granted across both periods; plan is updated to whichever
--     plan this extension used, so it always reflects the most recent
--     grant's terms.
--
-- `for update` on the existing-row lookup serializes two concurrent grant/
-- extend calls for the same driver — the second call's SELECT blocks until
-- the first transaction commits, then re-reads the now-current row, so two
-- admins acting on the same driver at the same time can never both apply
-- their extension against the same stale expires_at (no lost update).
--
-- Never touches drivers.verification_status/verification_notes or any
-- other driver column — a subscription grant is not a verification
-- decision (Phase 5 of the brief).
-- ----------------------------------------------------------------------------
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

  if not exists (select 1 from public.drivers where id = p_driver_id) then
    raise exception 'Driver not found' using errcode = 'P0002';
  end if;

  select amount, duration_days into v_amount, v_duration_days
  from public.subscription_plans
  where plan = p_plan and is_active = true;

  if v_amount is null then
    raise exception 'Invalid or inactive plan: %', p_plan using errcode = '22023';
  end if;

  -- Lock this driver's active row (if any) for the duration of this
  -- transaction — see the concurrency note above.
  select * into v_existing
  from public.subscriptions
  where driver_id = p_driver_id and status = 'active' and deleted_at is null
  for update;

  if found and v_existing.expires_at > now() then
    v_action := 'extend';
    v_previous_expires_at := v_existing.expires_at;
    v_new_starts_at := v_existing.starts_at;
    v_new_expires_at := v_existing.expires_at + (v_duration_days || ' days')::interval;

    update public.subscriptions
    set plan = p_plan,
        amount = amount + v_amount,
        expires_at = v_new_expires_at,
        granted_by = v_admin_id,
        grant_reason = coalesce(p_reason, grant_reason)
    where id = v_existing.id
    returning id into v_subscription_id;
  else
    v_action := 'grant';
    v_previous_expires_at := case when found then v_existing.expires_at else null end;
    v_new_starts_at := now();
    v_new_expires_at := now() + (v_duration_days || ' days')::interval;

    if found then
      update public.subscriptions set status = 'expired' where id = v_existing.id;
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
  'Admin-only (is_admin() enforced inside the function, not just at the RLS/UI layer) grant/extend of a driver subscription. Amount and duration always come from subscription_plans, never from the client. Grant vs. extend, start date, and expiry are all decided server-side from the driver''s actual current subscription row, locked FOR UPDATE to make concurrent admin actions on the same driver safe. Every call is recorded in admin_subscription_actions.';

revoke all on function public.admin_grant_driver_subscription(uuid, public.subscription_plan_enum, text) from public;
grant execute on function public.admin_grant_driver_subscription(uuid, public.subscription_plan_enum, text) to authenticated;
