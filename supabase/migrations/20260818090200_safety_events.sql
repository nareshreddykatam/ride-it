-- ============================================================================
-- 20260818090200_safety_events.sql
-- Phase 13. The real SOS/safety-event record.
--
-- Location is stored as plain lat/lng doubles, not PostGIS geography —
-- deliberately: nothing about this table needs spatial QUERYING (no
-- "find nearby SOS events" use case), so adding geography/spatial
-- indexing here would be unjustified complexity for a table that only
-- ever needs to display a single point to an admin reviewing one event.
--
-- The triggering user has NO update policy on their own row — only
-- admin can transition status. This is deliberate: "Do not automatically
-- mark an SOS resolved merely because the user closes the screen" (item
-- 12) means the lifecycle must be admin-driven, not something the
-- triggering user's own client could short-circuit even accidentally.
-- ============================================================================

create table public.safety_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  triggered_by_role public.user_role_enum not null,
  ride_id uuid references public.rides (id) on delete set null,
  status public.safety_event_status_enum not null default 'open',
  latitude double precision,
  longitude double precision,
  note text,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  updated_by uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint safety_events_latitude_range check (latitude is null or (latitude between -90 and 90)),
  constraint safety_events_longitude_range check (longitude is null or (longitude between -180 and 180))
);

create index safety_events_status_idx on public.safety_events (status, created_at desc);
create index safety_events_user_idx on public.safety_events (user_id);
create index safety_events_ride_idx on public.safety_events (ride_id) where ride_id is not null;

create trigger set_updated_at
  before update on public.safety_events
  for each row execute function public.set_updated_at();

comment on table public.safety_events is 'Real SOS/safety-event records. latitude/longitude are a best-effort snapshot from the triggering device''s own browser geolocation at the moment of activation — "latest authorized location if available", not a live-tracked stream. The triggering user can create and read their own events but cannot change status — only admin can, via set_safety_event_status().';

alter table public.safety_events enable row level security;

create policy "safety_events_select_own" on public.safety_events
  for select using (user_id = auth.uid());

create policy "safety_events_all_admin" on public.safety_events
  for all using (public.is_admin()) with check (public.is_admin());

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

  insert into public.safety_events (user_id, triggered_by_role, ride_id, latitude, longitude, note)
  values (auth.uid(), v_role, p_ride_id, p_latitude, p_longitude, p_note)
  returning * into v_event;

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

revoke execute on function public.trigger_sos(uuid, double precision, double precision, text) from public;
grant execute on function public.trigger_sos(uuid, double precision, double precision, text) to authenticated;

comment on function public.trigger_sos(uuid, double precision, double precision, text) is 'The sole path for creating a safety_events row. Notifies every current admin. Never claims to contact emergency services — see the app-layer UI copy and the Phase 13 review doc.';

create or replace function public.set_safety_event_status(p_event_id uuid, p_status public.safety_event_status_enum, p_note text default null)
returns public.safety_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.safety_events;
begin
  if not public.is_admin() then
    raise exception 'Only admins may change a safety event''s status' using errcode = '42501';
  end if;

  update public.safety_events
  set status = p_status,
      note = coalesce(p_note, note),
      acknowledged_at = case when p_status = 'acknowledged' and acknowledged_at is null then now() else acknowledged_at end,
      resolved_at = case when p_status in ('resolved', 'closed') and resolved_at is null then now() else resolved_at end,
      updated_by = auth.uid()
  where id = p_event_id
  returning * into v_event;

  if v_event.id is null then
    raise exception 'Safety event not found' using errcode = 'P0002';
  end if;

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

revoke execute on function public.set_safety_event_status(uuid, public.safety_event_status_enum, text) from public;
grant execute on function public.set_safety_event_status(uuid, public.safety_event_status_enum, text) to authenticated;
