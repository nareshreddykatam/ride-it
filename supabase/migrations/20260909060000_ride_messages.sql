-- ============================================================================
-- 20260909060000_ride_messages.sql
-- Ride-specific in-app chat between the assigned passenger and driver.
--
-- Design notes (why this shape, not a generic messaging system):
--
-- 1. NOT a denormalized-participant table. ride_messages carries only
--    ride_id + sender_id -- no passenger_id/driver_id snapshot columns.
--    Authorization is derived by joining to the CURRENT live rides row at
--    query/insert time (see the RLS policy and both RPCs below). This is
--    exactly what makes driver rematch correct for free: the moment
--    cancel_ride_by_driver() clears rides.driver_id (or reassigns it to a
--    new driver via accept_ride_offer()), the old driver's join condition
--    stops matching on the very next query -- no separate "revoke access"
--    step, no second chat thread, and it's enforced server-side (the
--    live join), not just by hiding a UI button. This mirrors the exact
--    "no denormalized snapshot, check the live ride row" principle
--    accept_ride_offer()'s own busy-driver guard already established.
--
-- 2. Messages are immutable and RLS has no INSERT/UPDATE policy for
--    regular users at all -- matching ride_offers' own established
--    pattern (20260813090000_ride_offers.sql: "offers are only ever
--    created/mutated by SECURITY DEFINER matching functions"). All
--    writes go through two narrowly-scoped RPCs:
--      - send_ride_message(): the only way a message is ever created.
--      - mark_ride_messages_read(): the only column-level mutation
--        allowed (read_at only), so "prefer immutable messages" holds
--        for message/ride_id/sender_id without needing RLS to enforce
--        column-level immutability itself.
--
-- 3. Reads (SELECT + Realtime subscription) do NOT require read_at
--    scoping or an RPC -- a plain RLS SELECT policy is sufficient and
--    matches how every other read-only, RLS-safe table in this schema
--    is queried directly from the client (e.g. getActiveOffersForDriver
--    against ride_offers). Supabase Realtime evaluates this same SELECT
--    policy per change event (documented precedent: matching.ts's
--    subscribeToDriverOffers comment), so a non-participant's realtime
--    subscription to a ride they can't read simply receives nothing --
--    not a separate trust boundary from the table's own RLS.
-- ============================================================================

create table public.ride_messages (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  sender_id uuid not null references public.users (id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint ride_messages_message_not_blank check (btrim(message) <> ''),
  -- Generous enough for a real conversational message, far short of
  -- "arbitrary file/document via text" abuse. Enforced again inside
  -- send_ride_message() first, for a clean error message -- this
  -- constraint is the unconditional backstop against any other insertion
  -- path, same "belt and suspenders" pattern as update_driver_speed()'s
  -- own range check backed by a trigger-independent guarantee.
  constraint ride_messages_message_length check (char_length(message) <= 1000)
);

-- Serves both "all messages for this ride, chronological" (the only read
-- pattern this feature has) and cursor-based pagination on (created_at,
-- id) -- id as the tiebreaker for same-millisecond inserts, per the
-- brief's own explicit callout of that theoretical collision.
create index ride_messages_ride_created_idx on public.ride_messages (ride_id, created_at, id);

-- Serves the unread-count query (badge): "how many messages in ride X
-- were sent by the OTHER participant and not yet read", without scanning
-- every message in a long-running ride's history.
create index ride_messages_unread_idx on public.ride_messages (ride_id, sender_id) where read_at is null;

comment on table public.ride_messages is
  'Ride-scoped chat messages between the assigned passenger and driver. No passenger_id/driver_id columns by design -- participant authorization is always derived from the CURRENT rides.passenger_id/driver_id at query time (see RLS policy below), so driver reassignment after a cancellation correctly and immediately changes who can read/send without any extra bookkeeping. Immutable once sent (no UPDATE policy touches message/ride_id/sender_id) -- read_at is the only ever-mutated column, via mark_ride_messages_read() only.';

alter table public.ride_messages enable row level security;

-- Read access: both current participants, but ONLY once a driver has
-- actually been assigned (rides.driver_id is not null) -- before that,
-- driver_id is null and nothing ever equals auth.uid() = null, so this
-- single condition also correctly satisfies "passenger must not have
-- chat access before a driver is assigned" without a separate status
-- check. Deliberately not restricted by ride status beyond that: once a
-- ride has ever had a driver, both parties may always read the history
-- (including after completion/cancellation) -- only SENDING is further
-- gated by status, in the RPC below.
create policy "ride_messages_select_participant" on public.ride_messages
  for select using (
    exists (
      select 1 from public.rides r
      where r.id = ride_messages.ride_id
        and r.driver_id is not null
        and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

create policy "ride_messages_all_admin" on public.ride_messages
  for all using (public.is_admin()) with check (public.is_admin());

-- No insert/update/delete policy for authenticated users — mutations are
-- exclusively through the two SECURITY DEFINER RPCs below, matching
-- ride_offers' established convention.

revoke all on public.ride_messages from public, authenticated;
grant select on public.ride_messages to authenticated;
-- INSERT/UPDATE are not granted at the table level at all — even a
-- crafted raw PostgREST request cannot bypass send_ride_message()/
-- mark_ride_messages_read() to reach the table directly; only SECURITY
-- DEFINER functions (which run with the function owner's privilege, not
-- the caller's table grants) can write here.

-- ----------------------------------------------------------------------------
-- send_ride_message — the only way a ride_messages row is ever created.
-- Validates, in order: authenticated, ride exists, caller is the CURRENT
-- passenger or driver on that ride, ride is in a status that still
-- permits sending (not terminal), message is non-blank and within the
-- length limit. Sender is always auth.uid() — never a client parameter.
-- ----------------------------------------------------------------------------
create or replace function public.send_ride_message(p_ride_id uuid, p_message text)
returns public.ride_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
  v_trimmed text;
  v_row public.ride_messages;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if v_ride.driver_id is null
     or (v_ride.passenger_id != auth.uid() and v_ride.driver_id != auth.uid()) then
    raise exception 'Not a participant on this ride' using errcode = '42501';
  end if;

  -- Active-ride statuses only — mirrors the exact set update_driver_speed()
  -- already treats as "the ride is actively happening", PLUS the
  -- pre-pickup 'accepted'/'driver_arriving' window, when chat is most
  -- useful ("I'm outside", "which gate?") and the brief explicitly
  -- requires it ("After driver acceptance ... can chat"). Terminal
  -- statuses (ride_completed/payment/rated/cancelled) are excluded —
  -- sending is disabled, history remains readable via the SELECT policy.
  if v_ride.status not in ('accepted', 'driver_arriving', 'ride_started', 'destination_reached', 'payment_collected') then
    raise exception 'This ride is no longer accepting new messages' using errcode = '55000';
  end if;

  v_trimmed := btrim(p_message);
  if v_trimmed = '' then
    raise exception 'Message cannot be empty' using errcode = '22023';
  end if;
  if char_length(v_trimmed) > 1000 then
    raise exception 'Message is too long (max 1000 characters)' using errcode = '22001';
  end if;

  insert into public.ride_messages (ride_id, sender_id, message)
  values (p_ride_id, auth.uid(), v_trimmed)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.send_ride_message(uuid, text) from public;
grant execute on function public.send_ride_message(uuid, text) to authenticated;

comment on function public.send_ride_message(uuid, text) is
  'The only path that creates a ride_messages row. Sender is always auth.uid(), never client-supplied. Requires the caller to be the CURRENT passenger_id/driver_id on the ride (live join, not a snapshot) and the ride to be in an active, non-terminal status. Raises a clean, specific error for every rejection reason (not a participant, ride terminal, empty message, message too long) rather than a generic RLS-style denial.';

-- ----------------------------------------------------------------------------
-- mark_ride_messages_read — the only column-level mutation allowed on
-- this table: sets read_at on the CALLER'S UNREAD INCOMING messages for
-- one ride (messages sent by the other participant, not their own).
-- Callable at any ride status (reading/acknowledging history after a
-- ride ends is still legitimate) — only send_ride_message() is
-- status-gated.
-- ----------------------------------------------------------------------------
create or replace function public.mark_ride_messages_read(p_ride_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_participant boolean;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select exists (
    select 1 from public.rides r
    where r.id = p_ride_id
      and r.driver_id is not null
      and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
  ) into v_is_participant;

  if not v_is_participant then
    raise exception 'Not a participant on this ride' using errcode = '42501';
  end if;

  update public.ride_messages
  set read_at = now()
  where ride_id = p_ride_id
    and sender_id != auth.uid()
    and read_at is null;
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

revoke execute on function public.mark_ride_messages_read(uuid) from public;
grant execute on function public.mark_ride_messages_read(uuid) to authenticated;

comment on function public.mark_ride_messages_read(uuid) is
  'Marks the calling participant''s unread incoming messages (sent by the OTHER participant) on one ride as read. Never touches the caller''s own sent messages, message content, ride_id, or sender_id — read_at is the only column this ever writes. Returns the number of rows updated.';

-- Realtime: INSERT events on ride_messages, RLS-scoped exactly like every
-- other realtime-enabled table in this schema (drivers, rides,
-- ride_offers) — a subscriber only receives change events for rows their
-- own SELECT policy already permits.
alter publication supabase_realtime add table public.ride_messages;
