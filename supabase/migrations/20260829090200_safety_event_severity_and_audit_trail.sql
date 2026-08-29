-- ============================================================================
-- 20260829090200_safety_event_severity_and_audit_trail.sql
--
-- Extends the existing safety_events state machine (Phase 13:
-- open -> acknowledged -> investigating -> resolved/closed) rather than
-- building a second, parallel one:
--   - one new status value, 'escalated' (a distinct, visible admin action
--     from "investigating" — the brief explicitly lists it as its own
--     admin action)
--   - severity, reusing support_ticket_severity_enum (Phase 13) instead of
--     inventing a second severity type — low/medium/high/critical already
--     exists and already means the same thing here. Defaults to 'high':
--     someone pressed the panic button, that starts urgent by default and
--     an admin reclassifies after review, not the other way around.
--   - event_type text, default 'sos' — every event today genuinely is an
--     SOS trigger (the only insert path is trigger_sos()), but a plain
--     text column costs nothing and avoids a future enum migration if a
--     different event source (e.g. an escalated report) ever needs to
--     land in this same table.
--   - safety_event_notes: the actual audit trail. The original table's
--     `note` column only ever held the LATEST note (each update
--     overwrites it via coalesce) — fine as a "current status" field, not
--     an audit trail. This table is genuinely new because nothing existing
--     already does "append-only history of admin actions on a safety
--     event"; ride_events (Phase 3) plays that role for rides but doesn't
--     fit here (not every safety event has a ride_id, and mixing
--     safety-investigation notes into the ride timeline would leak
--     internal-only content into a table ride_events readers can already
--     partially see).
--
-- trigger_sos() also becomes idempotent: repeated taps (double-tap, a
-- flaky network retry) return the caller's existing non-terminal event
-- for the same ride instead of creating a duplicate — "prevent duplicate
-- active events where inappropriate", enforced structurally rather than
-- relying on the client to not double-submit.
-- ============================================================================

alter type public.safety_event_status_enum add value 'escalated';

alter table public.safety_events
  add column severity public.support_ticket_severity_enum not null default 'high',
  add column event_type text not null default 'sos';

comment on column public.safety_events.severity is 'Defaults to high at creation (an SOS starts urgent by default); an admin may reclassify via set_safety_event_status(). Reuses support_ticket_severity_enum rather than a second severity type.';
comment on column public.safety_events.event_type is 'Free text, default ''sos'' — every current row is a real SOS trigger (the only insert path is trigger_sos()). Left as text, not an enum, so a future event source doesn''t need a type migration.';

create table public.safety_event_notes (
  id uuid primary key default gen_random_uuid(),
  safety_event_id uuid not null references public.safety_events (id) on delete cascade,
  admin_id uuid references public.admin_users (id) on delete set null,
  note text,
  status_transition_to public.safety_event_status_enum,
  created_at timestamptz not null default now()
);

create index safety_event_notes_event_idx on public.safety_event_notes (safety_event_id, created_at);

comment on table public.safety_event_notes is 'Append-only audit trail for a safety_events row: every status transition and every free-standing admin note, in order. admin_id is null for the row trigger_sos() itself inserts at creation (a user action, not an admin one). Never updated or deleted — history, not current state.';

alter table public.safety_event_notes enable row level security;

create policy "safety_event_notes_all_admin" on public.safety_event_notes
  for all using (public.is_admin()) with check (public.is_admin());

alter publication supabase_realtime add table public.safety_event_notes;

-- ----------------------------------------------------------------------------
-- trigger_sos() — idempotent version. Everything except the new dedup
-- check and the audit-trail insert is unchanged from
-- 20260818090200_safety_events.sql.
-- ----------------------------------------------------------------------------
create or replace function public.trigger_sos(
  p_ride_id uuid default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_note text default null
)
returns public.safety_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role_enum;
  v_event public.safety_events;
  v_admin record;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select role into v_role from public.users where id = auth.uid();
  if v_role is null then
    raise exception 'Caller has no user profile' using errcode = '42501';
  end if;

  if p_ride_id is not null then
    if not exists (
      select 1 from public.rides r
      where r.id = p_ride_id and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
    ) then
      raise exception 'Caller is not a party to this ride' using errcode = '42501';
    end if;
  end if;

  -- Idempotent: a repeat trigger for the same user + same ride (including
  -- both null, i.e. no ride context) while an earlier event is still
  -- non-terminal returns that event rather than creating a duplicate.
  select * into v_event
  from public.safety_events
  where user_id = auth.uid()
    and ride_id is not distinct from p_ride_id
    and status not in ('resolved', 'closed')
  order by created_at desc
  limit 1;

  if v_event.id is not null then
    return v_event;
  end if;

  insert into public.safety_events (user_id, triggered_by_role, ride_id, latitude, longitude, note)
  values (auth.uid(), v_role, p_ride_id, p_latitude, p_longitude, p_note)
  returning * into v_event;

  insert into public.safety_event_notes (safety_event_id, admin_id, note, status_transition_to)
  values (v_event.id, null, p_note, 'open');

  for v_admin in select id from public.admin_users loop
    perform public._create_notification(
      v_admin.id,
      'safety',
      'SOS activated',
      format('A %s has triggered an SOS.', v_role),
      jsonb_build_object('safety_event_id', v_event.id, 'ride_id', p_ride_id)
    );
  end loop;

  return v_event;
end;
$$;

-- ----------------------------------------------------------------------------
-- set_safety_event_status() — dropped and re-created because the new
-- p_severity parameter changes its signature; CREATE OR REPLACE would
-- otherwise leave the old 3-argument version as a separate overload
-- (same reasoning as 20260827090100's plate-number change).
-- ----------------------------------------------------------------------------
drop function if exists public.set_safety_event_status(uuid, public.safety_event_status_enum, text);

create or replace function public.set_safety_event_status(
  p_event_id uuid,
  p_status public.safety_event_status_enum,
  p_note text default null,
  p_severity public.support_ticket_severity_enum default null
)
returns public.safety_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.safety_events;
  v_current_status public.safety_event_status_enum;
begin
  if not public.is_admin() then
    raise exception 'Only admins may change a safety event''s status' using errcode = '42501';
  end if;

  select status into v_current_status from public.safety_events where id = p_event_id;
  if v_current_status is null then
    raise exception 'Safety event not found' using errcode = 'P0002';
  end if;
  if v_current_status = 'closed' then
    raise exception 'This safety event is closed and cannot be modified further' using errcode = 'P0001';
  end if;

  update public.safety_events
  set status = p_status,
      note = coalesce(p_note, note),
      severity = coalesce(p_severity, severity),
      acknowledged_at = case when p_status = 'acknowledged' and acknowledged_at is null then now() else acknowledged_at end,
      resolved_at = case when p_status in ('resolved', 'closed') and resolved_at is null then now() else resolved_at end,
      updated_by = auth.uid()
  where id = p_event_id
  returning * into v_event;

  if v_event.id is null then
    raise exception 'Safety event not found' using errcode = 'P0002';
  end if;

  insert into public.safety_event_notes (safety_event_id, admin_id, note, status_transition_to)
  values (p_event_id, auth.uid(), p_note, p_status);

  perform public._create_notification(
    v_event.user_id,
    'safety',
    'Safety report updated',
    format('Your safety report status is now: %s.', p_status),
    jsonb_build_object('safety_event_id', v_event.id)
  );

  return v_event;
end;
$$;

revoke execute on function public.set_safety_event_status(uuid, public.safety_event_status_enum, text, public.support_ticket_severity_enum) from public;
grant execute on function public.set_safety_event_status(uuid, public.safety_event_status_enum, text, public.support_ticket_severity_enum) to authenticated;

comment on function public.set_safety_event_status(uuid, public.safety_event_status_enum, text, public.support_ticket_severity_enum) is 'Admin-only status/severity transition. Every call appends a safety_event_notes row (the audit trail), even when p_note is null — the status_transition_to column alone still records who did what, when.';

create or replace function public.add_safety_event_note(p_event_id uuid, p_note text)
returns public.safety_event_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.safety_event_notes;
begin
  if not public.is_admin() then
    raise exception 'Only admins may add a note to a safety event' using errcode = '42501';
  end if;

  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'Note text is required' using errcode = '22023';
  end if;

  if not exists (select 1 from public.safety_events where id = p_event_id) then
    raise exception 'Safety event not found' using errcode = 'P0002';
  end if;

  insert into public.safety_event_notes (safety_event_id, admin_id, note)
  values (p_event_id, auth.uid(), trim(p_note))
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.add_safety_event_note(uuid, text) from public;
grant execute on function public.add_safety_event_note(uuid, text) to authenticated;

comment on function public.add_safety_event_note(uuid, text) is 'Admin-only free-standing audit-trail note with no status change (status_transition_to left null). Distinct from set_safety_event_status() so a note can be logged without forcing a state transition.';
