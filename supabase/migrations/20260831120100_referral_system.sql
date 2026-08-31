-- ============================================================================
-- 20260831120100_referral_system.sql
--
-- Universal referral system — supports all four inviter/invitee role
-- combinations (passenger->passenger, passenger->driver, driver->passenger,
-- driver->driver). Built entirely on existing conventions already proven
-- in this codebase, not new infrastructure:
--   - app_settings (20260803120200) for the four admin-configurable reward
--     amounts + enable flag + qualifying-ride-count — same pattern as the
--     matching engine's own tunables (_get_matching_setting_int).
--   - wallets/wallet_transactions (20260803120800) as the reward-payout
--     ledger — this table existed but had ZERO write path anywhere in the
--     codebase before this migration (confirmed by grepping every
--     migration for `insert into public.wallet_transactions` — no
--     results). _credit_wallet() below is the first, and is written to be
--     the one safe, atomic, idempotent way to credit ANY wallet, not
--     referral-specific, so future work (ride-earning payouts, refund
--     credits) can reuse it instead of inventing a second path.
--   - notifications/_create_notification (20260815090200) for inviter
--     updates — reuses the existing push-dispatch trigger
--     (_dispatch_push_for_notification, 20260828090000) automatically,
--     no new notification plumbing needed.
--   - The existing users/passengers/drivers role model — no second
--     user-type system introduced. inviter_role/invitee_role are snapshot
--     copies of users.role at attribution time (see rationale below).
--
-- QUALIFYING EVENT: exclusively driven from complete_ride()'s own success
-- path (redefined at the bottom of this file) — a referral can only ever
-- progress from a ride that genuinely reached ride_completed through the
-- existing, atomic, party-authorized complete_ride() RPC. Cancelled,
-- incomplete, or otherwise-invalid rides structurally never reach this
-- code at all, so no separate "is this ride valid" check is needed or
-- added — the single call site IS the validation.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Referral code — one per user (any role), stored directly on `users`
-- rather than a separate one-row-per-code table: a user has at most one
-- code, ever, so a dedicated table would only add a join for no benefit.
-- Generated lazily (get_or_create_my_referral_code below), not at signup,
-- to avoid touching handle_new_auth_user() — that trigger is exercised by
-- every single signup across both apps and has already been the subject
-- of several careful, narrow fixes; growing it for a feature that doesn't
-- need eager generation is unnecessary risk.
-- ----------------------------------------------------------------------------
alter table public.users add column if not exists referral_code text;
create unique index if not exists users_referral_code_idx on public.users (referral_code) where referral_code is not null;

comment on column public.users.referral_code is 'Server-generated, human-readable (Crockford-ish base32, no 0/O/1/I), case-insensitive on lookup (stored upper). Lazily created on first request via get_or_create_my_referral_code() — most users never generate one at all. Never derived from phone/email/id.';

-- users_update_own's RLS (20260803121100) is a broad row-level policy with
-- no column restriction — without this, a user could directly overwrite
-- their OWN referral_code via a raw client update, bypassing
-- _generate_referral_code()'s collision-safety and human-readability
-- guarantees, or invalidate a code they've already shared. Extends the
-- EXISTING protect_users_system_columns() trigger (same shape already
-- used for role/is_active/deleted_at) rather than adding a second,
-- parallel protective trigger on the same table.
create or replace function public.protect_users_system_columns()
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

  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.deleted_at is distinct from old.deleted_at
     or new.referral_code is distinct from old.referral_code
  then
    raise exception 'Cannot modify protected user fields directly' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- referrals — the append-mostly attribution + qualification ledger.
-- ----------------------------------------------------------------------------
create type public.referral_status_enum as enum ('attributed', 'qualified', 'rewarded', 'expired');

create table public.referrals (
  id uuid primary key default gen_random_uuid(),

  inviter_id uuid not null references public.users (id) on delete restrict,
  invitee_id uuid not null references public.users (id) on delete restrict,

  -- Snapshotted at attribution time, not derived via a join at read time —
  -- same "snapshot, don't let a later change rewrite history" philosophy
  -- as reward_amount below. A role never actually changes in this system
  -- today, so this is defense-in-depth/self-documentation more than a
  -- live requirement, but it's what makes the reward-type lookup in
  -- redeem_referral_code() a plain string, not a join.
  inviter_role public.user_role_enum not null,
  invitee_role public.user_role_enum not null,

  referral_code text not null, -- the code actually used, denormalized (same rationale as ride_offers' own snapshot columns)

  status public.referral_status_enum not null default 'attributed',

  required_rides_snapshot integer not null, -- referral_required_completed_rides at attribution time
  qualifying_rides_count integer not null default 0,

  reward_amount numeric(10, 2), -- set once, at qualification time, from the CURRENT admin config — never recomputed later
  wallet_transaction_id uuid references public.wallet_transactions (id) on delete set null,

  qualified_at timestamptz,
  rewarded_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint referrals_no_self_referral check (inviter_id <> invitee_id),
  constraint referrals_one_attribution_per_invitee unique (invitee_id),
  constraint referrals_qualifying_rides_non_negative check (qualifying_rides_count >= 0),
  constraint referrals_required_rides_positive check (required_rides_snapshot >= 1),
  constraint referrals_reward_amount_non_negative check (reward_amount is null or reward_amount >= 0),
  constraint referrals_rewarded_has_amount_and_time
    check (status <> 'rewarded' or (reward_amount is not null and qualified_at is not null and rewarded_at is not null))
);

create index referrals_inviter_idx on public.referrals (inviter_id, created_at desc);
-- invitee lookup is the hot path on every ride completion (see
-- _qualify_referrals_for_ride below) — indexed on invitee_id alone since
-- the unique constraint above already guarantees at most one row.
create index referrals_status_idx on public.referrals (status);

create trigger set_updated_at
  before update on public.referrals
  for each row execute function public.set_updated_at();

comment on table public.referrals is 'One row per successfully-attributed invitee (unique on invitee_id — an invitee can never have more than one inviter, and never be reassigned). reward_amount/qualified_at/rewarded_at are snapshot at qualification time and never recomputed if admin settings change afterward.';

alter table public.referrals enable row level security;

create policy "referrals_select_own_as_inviter" on public.referrals
  for select using (inviter_id = auth.uid());

create policy "referrals_select_own_as_invitee" on public.referrals
  for select using (invitee_id = auth.uid());

create policy "referrals_all_admin" on public.referrals
  for all using (public.is_admin()) with check (public.is_admin());

-- No insert/update policy for passengers/drivers at all, by design — every
-- write goes through redeem_referral_code()/_qualify_referrals_for_ride()
-- below (SECURITY DEFINER), the same "table has no client-writable path,
-- RPC is the only door" pattern already used by wallets/wallet_transactions
-- and rides' financial columns.

revoke all on public.referrals from public;
grant select on public.referrals to authenticated;
grant all on public.referrals to service_role;

-- ----------------------------------------------------------------------------
-- Admin-configurable settings — reusing app_settings exactly like the
-- matching engine's own tunables, not a new config table.
--
-- Deliberately defaulted to DISABLED with every reward at ₹0: this is a
-- brand-new feature that moves real money (via wallet credits). Turning
-- it on with real amounts is an explicit business decision for the Admin
-- to make, not something this migration should decide on their behalf —
-- see the final report's "business decisions required" section.
--
-- referral_expiry_days / max reward caps were considered (per the task's
-- own Phase 8) and deliberately NOT added: no evidence they're needed
-- yet, and Phase 30 explicitly says not to invent business rules that
-- need an owner decision. Documented, not built.
-- ----------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('referral_enabled', 'false', 'Master switch for the referral program. Off by default — an admin must deliberately turn this on.'),
  ('referral_passenger_to_passenger_reward', '0', 'Reward (INR) paid to a passenger whose invited passenger completes their qualifying ride(s).'),
  ('referral_passenger_to_driver_reward', '0', 'Reward (INR) paid to a passenger whose invited driver completes onboarding/verification and their qualifying ride(s).'),
  ('referral_driver_to_passenger_reward', '0', 'Reward (INR) paid to a driver whose invited passenger completes their qualifying ride(s).'),
  ('referral_driver_to_driver_reward', '0', 'Reward (INR) paid to a driver whose invited driver completes onboarding/verification and their qualifying ride(s).'),
  ('referral_required_completed_rides', '1', 'Number of the invitee''s own completed rides required before the inviter''s referral reward is issued.')
on conflict (key) do nothing;

create or replace function public._get_app_setting_numeric(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value)::text::numeric from public.app_settings where key = p_key), p_default);
$$;

revoke execute on function public._get_app_setting_numeric(text, numeric) from public;
revoke execute on function public._get_app_setting_numeric(text, numeric) from authenticated;

create or replace function public._get_app_setting_bool(p_key text, p_default boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value)::text::boolean from public.app_settings where key = p_key), p_default);
$$;

revoke execute on function public._get_app_setting_bool(text, boolean) from public;
revoke execute on function public._get_app_setting_bool(text, boolean) from authenticated;

-- ----------------------------------------------------------------------------
-- Referral code generation — 8 characters, Crockford-base32-style alphabet
-- (excludes 0/O/1/I to avoid human transcription errors), collision-safe
-- via retry loop (same shape as _generate_random_pin's approach, scaled
-- up: 32^8 ≈ 1.1e12 possibilities, so a collision on any single attempt is
-- astronomically unlikely — the loop exists for correctness, not because
-- collisions are expected in practice). Never derived from phone/email/id.
-- ----------------------------------------------------------------------------
create or replace function public._generate_referral_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  -- Exactly 32 symbols (verified by char_length below, not just eyeballed
  -- — a real earlier draft of this string was silently only 31 characters
  -- long, which combined with `% 32` occasionally computed substr()'s
  -- out-of-bounds position 32 on a 31-char string; substr() doesn't error
  -- on that, it just silently returns '', shortening the generated code.
  -- Caught live during this task's own testing, not shipped.
  v_alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- digits 2-9 + A-Z minus 0/1/I/O
  v_code text;
  v_attempt integer := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1);
    end loop;

    exit when not exists (select 1 from public.users where referral_code = v_code);

    if v_attempt > 20 then
      raise exception 'Could not generate a unique referral code' using errcode = 'P0001';
    end if;
  end loop;

  return v_code;
end;
$$;

revoke execute on function public._generate_referral_code() from public;
revoke execute on function public._generate_referral_code() from authenticated;

create or replace function public.get_or_create_my_referral_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select referral_code into v_code from public.users where id = auth.uid();
  if v_code is not null then
    return v_code;
  end if;

  v_code := public._generate_referral_code();

  perform public._mark_trusted_write();
  update public.users set referral_code = v_code where id = auth.uid();

  return v_code;
end;
$$;

revoke execute on function public.get_or_create_my_referral_code() from public;
grant execute on function public.get_or_create_my_referral_code() to authenticated;

comment on function public.get_or_create_my_referral_code() is 'Returns the caller''s own referral code, generating one on first call. Marks itself a trusted write so protect_users_system_columns (if it covers referral_code) permits this narrow self-write; referral_code is otherwise not client-writable.';

-- ----------------------------------------------------------------------------
-- Wallet crediting — the first real write path for wallet_transactions in
-- this codebase (see this file's header comment). Generic (not
-- referral-specific) on purpose: atomically locks the target wallet row,
-- appends the ledger entry, and updates the denormalized balance in the
-- same transaction. Idempotent per (reference_type, reference_id) via the
-- partial unique index below — a duplicate call for the same reference is
-- silently a no-op (returns the existing transaction id), not an error,
-- so a retried request can never double-credit.
-- ----------------------------------------------------------------------------
create unique index if not exists wallet_transactions_reference_once_idx
  on public.wallet_transactions (reference_type, reference_id)
  where reference_type is not null and reference_id is not null;

create or replace function public._credit_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_reason public.wallet_transaction_reason_enum,
  p_reference_type text,
  p_reference_id uuid,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_new_balance numeric;
  v_existing_tx_id uuid;
  v_tx_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'Credit amount must be positive' using errcode = '23514';
  end if;

  if p_reference_type is not null and p_reference_id is not null then
    select id into v_existing_tx_id
    from public.wallet_transactions
    where reference_type = p_reference_type and reference_id = p_reference_id;

    if v_existing_tx_id is not null then
      return v_existing_tx_id; -- already credited — idempotent no-op
    end if;
  end if;

  -- Lazily provision a wallet — today only handle_new_auth_user()'s
  -- driver branch does this eagerly; a passenger inviter earning their
  -- first referral reward is exactly the "later" case that migration's
  -- own comment anticipated, needing no schema change.
  insert into public.wallets (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select id, balance into v_wallet_id, v_new_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  v_new_balance := v_new_balance + p_amount;

  update public.wallets set balance = v_new_balance where id = v_wallet_id;

  insert into public.wallet_transactions (wallet_id, type, reason, amount, balance_after, reference_type, reference_id, description)
  values (v_wallet_id, 'credit', p_reason, p_amount, v_new_balance, p_reference_type, p_reference_id, p_description)
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

revoke execute on function public._credit_wallet(uuid, numeric, public.wallet_transaction_reason_enum, text, uuid, text) from public;
revoke execute on function public._credit_wallet(uuid, numeric, public.wallet_transaction_reason_enum, text, uuid, text) from authenticated;

-- ----------------------------------------------------------------------------
-- redeem_referral_code — the one and only path that creates a referrals
-- row. Called by the invitee, once, right after signup (Passenger/Driver
-- onboarding — see the app changes in this same commit). Deliberately
-- does NOT require phone verification or profile completeness beyond
-- being authenticated: attribution itself is not the qualifying event
-- (that's the whole point of this task's core business rule), so gating
-- it further here would just be extra friction with no fraud benefit —
-- the real protection is that NOTHING is paid out until a genuine
-- completed ride happens, enforced entirely server-side below.
-- ----------------------------------------------------------------------------
create or replace function public.redeem_referral_code(p_code text)
returns public.referrals
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_inviter public.users;
  v_invitee public.users;
  v_required integer;
  v_row public.referrals;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not public._get_app_setting_bool('referral_enabled', false) then
    raise exception 'Referrals are not currently enabled' using errcode = 'P0001';
  end if;

  select * into v_invitee from public.users where id = auth.uid();
  if v_invitee.id is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  select * into v_inviter from public.users where referral_code = upper(trim(p_code));
  if v_inviter.id is null then
    raise exception 'Invalid referral code' using errcode = 'P0002';
  end if;

  if v_inviter.id = v_invitee.id then
    raise exception 'You cannot use your own referral code' using errcode = '23514';
  end if;

  if exists (select 1 from public.referrals where invitee_id = v_invitee.id) then
    raise exception 'You have already been referred' using errcode = '23505';
  end if;

  v_required := public._get_app_setting_numeric('referral_required_completed_rides', 1)::integer;

  insert into public.referrals (
    inviter_id, invitee_id, inviter_role, invitee_role, referral_code, required_rides_snapshot
  )
  values (
    v_inviter.id, v_invitee.id, v_inviter.role, v_invitee.role, upper(trim(p_code)), greatest(v_required, 1)
  )
  returning * into v_row;

  perform public._create_notification(
    v_inviter.id,
    'referral',
    'Your referral joined RideIT',
    format('Someone joined RideIT using your referral code. You''ll be rewarded once they complete their first qualifying ride.'),
    jsonb_build_object('referral_id', v_row.id)
  );

  return v_row;
exception
  when unique_violation then
    raise exception 'You have already been referred' using errcode = '23505';
end;
$$;

revoke execute on function public.redeem_referral_code(text) from public;
grant execute on function public.redeem_referral_code(text) to authenticated;

comment on function public.redeem_referral_code(text) is 'The sole path that creates a referrals row. Self-referral and duplicate-attribution are rejected both here (friendly error) and at the database level (referrals_no_self_referral / referrals_one_attribution_per_invitee), so a concurrent double-submit can never create two rows for the same invitee.';

-- ----------------------------------------------------------------------------
-- _qualify_referrals_for_ride — called exclusively from complete_ride()'s
-- own success path (see the redefinition below), never directly by any
-- client. Checks BOTH directions on every completion (the ride's
-- passenger might be someone's invitee, independently the ride's driver
-- might be someone else's invitee — both can be true on the same ride)
-- and, for each 'attributed' referral matched, increments the qualifying
-- count; once it reaches required_rides_snapshot, atomically qualifies
-- AND credits the reward in one step (no separate manual-approval gate
-- exists in this system, so a distinct REWARD_PENDING limbo state would
-- be state with nothing that ever transitions it — not added, per "use
-- only the states actually necessary").
-- ----------------------------------------------------------------------------
create or replace function public._qualify_referrals_for_ride(p_ride public.rides)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref public.referrals;
  v_setting_key text;
  v_reward numeric;
  v_tx_id uuid;
begin
  for v_ref in
    select * from public.referrals
    where status = 'attributed'
      and invitee_id in (p_ride.passenger_id, p_ride.driver_id)
    -- Locks each matched row for the duration of this ride-completion
    -- transaction — two rides completing in the same instant for two
    -- different invitees of the same inviter (or, in principle, the same
    -- invitee, though that can't happen twice for one referral row) can
    -- never race each other into double-counting or double-crediting.
    for update
  loop
    -- Driver invitee: onboarding/verification must ALSO be satisfied.
    -- Structurally already guaranteed by the time a ride completes with
    -- this driver assigned (the matching engine only ever assigns
    -- verification_status = 'approved' drivers — 20260826090000 and
    -- earlier), but checked explicitly here anyway so this function's own
    -- correctness never silently depends on matching-engine internals it
    -- doesn't otherwise reference.
    if v_ref.invitee_role = 'driver' then
      if not exists (
        select 1 from public.drivers where id = v_ref.invitee_id and verification_status = 'approved'
      ) then
        continue;
      end if;
    end if;

    update public.referrals
    set qualifying_rides_count = qualifying_rides_count + 1
    where id = v_ref.id
    returning * into v_ref;

    if v_ref.qualifying_rides_count < v_ref.required_rides_snapshot then
      continue; -- not yet qualified — just recorded progress
    end if;

    v_setting_key := 'referral_' || v_ref.inviter_role::text || '_to_' || v_ref.invitee_role::text || '_reward';
    v_reward := public._get_app_setting_numeric(v_setting_key, 0);

    if v_reward <= 0 then
      -- Program disabled or this specific combination's reward is ₹0 —
      -- record qualification honestly without fabricating a payout.
      update public.referrals
      set status = 'qualified', qualified_at = now()
      where id = v_ref.id;
      continue;
    end if;

    v_tx_id := public._credit_wallet(
      v_ref.inviter_id,
      v_reward,
      'referral_reward',
      'referral',
      v_ref.id,
      format('Referral reward — %s referred a %s who completed their qualifying ride(s)', v_ref.inviter_role, v_ref.invitee_role)
    );

    update public.referrals
    set status = 'rewarded', qualified_at = now(), rewarded_at = now(), reward_amount = v_reward, wallet_transaction_id = v_tx_id
    where id = v_ref.id;

    perform public._create_notification(
      v_ref.inviter_id,
      'referral',
      'Your referral reward was issued',
      format('Your referral reward of ₹%s has been credited to your wallet.', v_reward),
      jsonb_build_object('referral_id', v_ref.id, 'reward_amount', v_reward)
    );
  end loop;
end;
$$;

revoke execute on function public._qualify_referrals_for_ride(public.rides) from public;
revoke execute on function public._qualify_referrals_for_ride(public.rides) from authenticated;

-- ----------------------------------------------------------------------------
-- complete_ride() — redefined once more (its full current body, from
-- 20260831093000_protect_ride_completion_transition.sql, is unchanged
-- below except for the one new line calling into referral qualification)
-- so the qualifying-ride check happens inside the SAME atomic transaction
-- as the ride actually completing — never a separate, racy step.
-- ----------------------------------------------------------------------------
create or replace function public.complete_ride(p_ride_id uuid)
returns public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  perform public._mark_trusted_write();

  update public.rides
  set status = 'ride_completed',
      completed_at = now(),
      payment_status = case when payment_method in ('cash', 'driver_upi') then 'paid' else payment_status end
  where id = p_ride_id
    and driver_id = auth.uid()
    and status = 'ride_started'
  returning * into v_ride;

  if v_ride.id is null then
    raise exception 'Ride is not in a state that can be completed (must be ride_started and assigned to the calling driver)' using errcode = 'P0001';
  end if;

  perform public._create_notification(
    v_ride.passenger_id,
    'ride_status',
    'Ride completed',
    format('Your ride is complete. Total fare: ₹%s.', v_ride.total_fare),
    jsonb_build_object('ride_id', v_ride.id)
  );
  perform public._create_notification(
    v_ride.driver_id,
    'ride_status',
    'Ride completed',
    format('Ride completed. Fare: ₹%s.', v_ride.total_fare),
    jsonb_build_object('ride_id', v_ride.id)
  );
  perform public._create_notification(
    v_ride.passenger_id,
    'ride_status',
    'How was your ride?',
    'Tap to rate your driver.',
    jsonb_build_object('ride_id', v_ride.id, 'kind', 'rating_reminder')
  );
  perform public._create_notification(
    v_ride.driver_id,
    'ride_status',
    'How was your passenger?',
    'Tap to rate your passenger.',
    jsonb_build_object('ride_id', v_ride.id, 'kind', 'rating_reminder')
  );

  perform public._qualify_referrals_for_ride(v_ride);

  return v_ride;
end;
$$;

comment on function public.complete_ride(uuid) is 'The sole path from ride_started to ride_completed. Raises P0001 (not a silent no-op) when the ride is not ride_started or not assigned to the calling driver. Marks itself as a trusted write so protect_ride_completion_transition permits this specific, narrow, audited mutation. Also drives referral qualification (_qualify_referrals_for_ride) in the same transaction — a cancelled/incomplete ride structurally never reaches this function at all, so referral rewards can only ever come from a genuine completion.';

-- ----------------------------------------------------------------------------
-- My own referral activity — passenger/driver-facing summary, used by
-- both apps' Refer & Earn screens. A thin, RLS-respecting read (no
-- SECURITY DEFINER needed — referrals_select_own_as_inviter already
-- grants exactly this).
-- ----------------------------------------------------------------------------
create or replace function public.get_my_referral_summary()
returns table (
  referral_code text,
  referral_enabled boolean,
  total_referrals integer,
  passenger_referrals integer,
  driver_referrals integer,
  qualified_or_rewarded_count integer,
  total_rewards_earned numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  return query
  select
    (select u.referral_code from public.users u where u.id = auth.uid()),
    public._get_app_setting_bool('referral_enabled', false),
    (select count(*)::integer from public.referrals where inviter_id = auth.uid()),
    (select count(*)::integer from public.referrals where inviter_id = auth.uid() and invitee_role = 'passenger'),
    (select count(*)::integer from public.referrals where inviter_id = auth.uid() and invitee_role = 'driver'),
    (select count(*)::integer from public.referrals where inviter_id = auth.uid() and status in ('qualified', 'rewarded')),
    (select coalesce(sum(reward_amount), 0) from public.referrals where inviter_id = auth.uid() and status = 'rewarded');
end;
$$;

revoke execute on function public.get_my_referral_summary() from public;
grant execute on function public.get_my_referral_summary() to authenticated;

-- ----------------------------------------------------------------------------
-- Admin dashboard — one server-aggregated snapshot, mirroring
-- admin_live_ops_snapshot()'s own shape (20260830090000) rather than
-- having the Admin app fetch raw referral rows and aggregate client-side.
-- ----------------------------------------------------------------------------
create or replace function public.admin_referral_summary()
returns table (
  total_referrals integer,
  passenger_to_passenger_count integer,
  passenger_to_driver_count integer,
  driver_to_passenger_count integer,
  driver_to_driver_count integer,
  attributed_count integer,
  qualified_count integer,
  rewarded_count integer,
  expired_count integer,
  total_rewards_paid numeric,
  conversion_rate numeric,
  avg_qualification_hours numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  select
    count(*)::integer,
    count(*) filter (where inviter_role = 'passenger' and invitee_role = 'passenger')::integer,
    count(*) filter (where inviter_role = 'passenger' and invitee_role = 'driver')::integer,
    count(*) filter (where inviter_role = 'driver' and invitee_role = 'passenger')::integer,
    count(*) filter (where inviter_role = 'driver' and invitee_role = 'driver')::integer,
    count(*) filter (where status = 'attributed')::integer,
    count(*) filter (where status = 'qualified')::integer,
    count(*) filter (where status = 'rewarded')::integer,
    count(*) filter (where status = 'expired')::integer,
    coalesce(sum(reward_amount) filter (where status = 'rewarded'), 0),
    round(100.0 * count(*) filter (where status in ('qualified', 'rewarded')) / nullif(count(*), 0), 1),
    round(extract(epoch from avg(qualified_at - created_at) filter (where qualified_at is not null)) / 3600.0, 1)
  from public.referrals;
end;
$$;

revoke all on function public.admin_referral_summary() from public;
grant execute on function public.admin_referral_summary() to authenticated;

comment on function public.admin_referral_summary() is 'Admin Referrals dashboard — single server-aggregated snapshot (counts by type/status, total paid, conversion rate, average time-to-qualify), not raw row fetching. is_admin() re-checked inside despite the grant to authenticated, same pattern as every other admin_* analytics function.';
