-- ============================================================================
-- 20260828090000_push_notification_dispatch.sql
--
-- Wires actual push delivery onto the existing notification-creation
-- system. 0010_notifications_and_support.sql's own table comment already
-- says it: "this table is the in-app inbox + delivery-intent record, not
-- the delivery mechanism itself" — this migration is that mechanism.
-- Every _create_notification() call site across the codebase (ride
-- lifecycle, matching/offers, payments, safety events, ratings) already
-- creates a row here; this adds exactly one AFTER INSERT trigger that
-- fans each new row out to a push-sending Edge Function via pg_net
-- (async — never blocks or fails the triggering transaction).
--
-- Auth: pg_net calls travel over the public internet, so the Edge
-- Function it calls must reject anything that doesn't carry a shared
-- secret. That secret is a self-generated deployment secret (not a
-- vendor credential) stored in Supabase Vault — readable only by this
-- SECURITY DEFINER function, never by any client role, and never
-- embedded in this file. It is provisioned once, out of band, via:
--   select vault.create_secret('<random value>', 'push_dispatch_secret');
-- Until that secret exists, the trigger no-ops (logs a warning, still
-- lets the notification insert itself succeed) rather than failing the
-- ride/payment/safety transaction that created the notification.
-- ============================================================================

create extension if not exists pg_net;

create or replace function public._dispatch_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_dispatch_secret' limit 1;

  if v_secret is null then
    raise warning 'push dispatch skipped for notification %: push_dispatch_secret not provisioned in Vault', new.id;
    return new;
  end if;

  perform net.http_post(
    url := 'https://tzzmofsiefygpucwpbpi.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-dispatch-secret', v_secret),
    body := jsonb_build_object(
      'notification_id', new.id,
      'user_id', new.user_id,
      'type', new.type,
      'title', new.title,
      'body', new.body,
      'data', new.data
    )
  );

  return new;
end;
$$;

revoke all on function public._dispatch_push_for_notification() from public, authenticated;

comment on function public._dispatch_push_for_notification() is 'Fans out every new public.notifications row to the send-push Edge Function via async pg_net. Never raises on delivery failure — a push-delivery problem must not roll back the ride/payment/safety event that created the notification. Silently no-ops (with a warning log) until push_dispatch_secret is provisioned in Vault.';

drop trigger if exists dispatch_push_on_notification on public.notifications;
create trigger dispatch_push_on_notification
  after insert on public.notifications
  for each row execute function public._dispatch_push_for_notification();
