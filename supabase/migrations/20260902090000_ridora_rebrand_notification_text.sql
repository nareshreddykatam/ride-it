-- ============================================================================
-- 20260902090000_ridora_rebrand_notification_text.sql
-- Product rebrand: RideIT -> Ridora. Pure user-facing text update for the
-- two places the old brand name was baked into already-deployed function
-- bodies (a referral notification's title/body, and a payment-eligibility
-- error message) — not something a repo-only text edit of the original
-- migration files could fix, since those already ran. CREATE OR REPLACE
-- FUNCTION with an otherwise byte-for-byte identical body (same signature,
-- same logic, same error codes) is the correct way to update deployed
-- function text without altering behavior. No table structure, RLS,
-- grants, or business logic changed by this migration.
-- ============================================================================

-- From 20260831120100_referral_system.sql — notification text only.
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
    'Your referral joined Ridora',
    format('Someone joined Ridora using your referral code. You''ll be rewarded once they complete their first qualifying ride.'),
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

-- From 20260816090200_ride_payment_rpcs.sql — error message text only.
create or replace function public.create_pending_ride_payment(p_ride_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
  v_existing public.payments;
  v_payment public.payments;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if v_ride.passenger_id is distinct from auth.uid() then
    raise exception 'Caller does not own this ride' using errcode = '42501';
  end if;

  if v_ride.payment_method is distinct from 'online' then
    raise exception 'Ride is not set to Ridora Online payment' using errcode = 'P0001';
  end if;

  if v_ride.status not in ('ride_completed', 'payment', 'rated') then
    raise exception 'Ride is not yet eligible for payment' using errcode = 'P0001';
  end if;

  if v_ride.payment_status = 'paid' then
    raise exception 'Ride is already paid' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.payments
  where ride_id = p_ride_id and status in ('created', 'pending', 'authorized')
  order by created_at desc
  limit 1;

  if v_existing.id is not null then
    return v_existing;
  end if;

  insert into public.payments (ride_id, passenger_id, amount, currency, status)
  values (p_ride_id, auth.uid(), v_ride.total_fare, v_ride.currency, 'created')
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke execute on function public.create_pending_ride_payment(uuid) from public;
grant execute on function public.create_pending_ride_payment(uuid) to authenticated;
