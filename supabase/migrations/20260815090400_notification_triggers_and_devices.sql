-- ============================================================================
-- 20260815090400_notification_triggers_and_devices.sql
-- Phase 10. Two triggers (both derive recipient_id from the row itself,
-- validated by existing RLS/insert-check constraints — never from
-- unvalidated client input) plus the push notification device
-- registration table.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Booking confirmed: AFTER INSERT trigger on `rides`, fires regardless of
-- which code path created the row (createRide() today, anything else
-- later) — more robust than hardcoding this into one client function,
-- and still fully server-authoritative since it's a trigger, not a
-- client call. NEW.passenger_id is safe to trust here because
-- rides_insert_passenger already requires passenger_id = auth.uid() for
-- the INSERT to succeed at all.
-- ----------------------------------------------------------------------------
create or replace function public.notify_ride_booked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'requested' then
    perform public._create_notification(
      new.passenger_id,
      'ride_status',
      'Ride booked',
      'Looking for a nearby driver…',
      jsonb_build_object('ride_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_ride_booked on public.rides;
create trigger notify_ride_booked
  after insert on public.rides
  for each row execute function public.notify_ride_booked();

-- ----------------------------------------------------------------------------
-- Driver verification status changed (Admin approves/rejects/suspends).
-- Phase 7's setDriverVerificationStatus() is a plain admin-RLS-gated
-- client UPDATE, same as before; a trigger is the right mechanism here
-- for the same reason as Phase 6.2's protect_driver_system_columns — it
-- covers the transition regardless of which code path performs it, not
-- just today's one call site.
-- ----------------------------------------------------------------------------
create or replace function public.notify_driver_verification_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_body text;
begin
  if new.verification_status is distinct from old.verification_status then
    v_title := case new.verification_status
      when 'approved' then 'You''re approved to drive'
      when 'rejected' then 'Registration needs attention'
      when 'suspended' then 'Account suspended'
      when 'in_review' then 'Documents under review'
      else null
    end;
    v_body := case new.verification_status
      when 'approved' then 'Your account is verified. You can go online and start accepting rides.'
      when 'rejected' then coalesce(new.verification_notes, 'Please review your submitted documents.')
      when 'suspended' then coalesce(new.verification_notes, 'Contact support for details.')
      when 'in_review' then 'An admin is reviewing your documents.'
      else null
    end;

    if v_title is not null then
      perform public._create_notification(
        new.id,
        'system',
        v_title,
        v_body,
        jsonb_build_object('verification_status', new.verification_status)
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_driver_verification_change on public.drivers;
create trigger notify_driver_verification_change
  after update on public.drivers
  for each row execute function public.notify_driver_verification_change();

-- ----------------------------------------------------------------------------
-- Push notification device registration — architecture only, per the
-- brief's explicit instruction ("do not invent credentials... document
-- what remains for production"). No FCM/APNs/Web Push credentials exist
-- in this environment; this table is what a real push-sending mechanism
-- (an Edge Function, most naturally) would read from. Nothing in this
-- migration or this phase actually sends a push notification.
-- ----------------------------------------------------------------------------
create table public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  platform text not null check (platform in ('web', 'ios', 'android')),
  push_token text not null,
  push_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_devices_unique_token unique (user_id, push_token)
);

create index notification_devices_user_idx on public.notification_devices (user_id) where push_enabled = true;

comment on table public.notification_devices is 'Push notification device registration (Web Push subscription / FCM / APNs token — platform-dependent format in push_token). Phase 10 architecture only — no real push credentials configured in this environment, nothing sends an actual push notification yet. See PHASE_10_NOTIFICATIONS_RIDE_PIN_REVIEW.md.';

create trigger set_updated_at
  before update on public.notification_devices
  for each row execute function public.set_updated_at();

alter table public.notification_devices enable row level security;

create policy "notification_devices_all_own" on public.notification_devices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "notification_devices_all_admin" on public.notification_devices
  for all using (public.is_admin()) with check (public.is_admin());
