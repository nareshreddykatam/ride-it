-- ============================================================================
-- 20260829090000_trusted_contacts_for_drivers.sql
--
-- Widens trusted_contacts (Phase 13, passenger-only) to also support
-- drivers, rather than building a second, near-identical
-- driver_trusted_contacts table. passenger_id -> user_id, FK target
-- moves from public.passengers to public.users (the table every role
-- shares) — the RLS predicate itself doesn't change in spirit, it was
-- already exactly "owner's own auth.uid()".
--
-- create_ride_share() references trusted_contacts.passenger_id directly
-- (as the optional "share with this contact" lookup) and must be updated
-- in the same migration — it is the only other function touching this
-- table.
--
-- Also closes two real gaps the original table left open (both explicitly
-- called for by this phase's brief): no limit on how many contacts a user
-- can add, and no protection against adding the same phone number twice.
-- A BEFORE INSERT trigger enforces both — DB-level, so it holds regardless
-- of which client path (app UI today, anything else later) inserts a row.
-- ============================================================================

alter table public.trusted_contacts rename column passenger_id to user_id;

alter table public.trusted_contacts drop constraint trusted_contacts_passenger_id_fkey;
alter table public.trusted_contacts
  add constraint trusted_contacts_user_id_fkey foreign key (user_id) references public.users (id) on delete cascade;

alter index trusted_contacts_passenger_idx rename to trusted_contacts_user_idx;

comment on table public.trusted_contacts is 'A user''s (passenger or driver) personal emergency contacts. Owner-only access — no admin policy by design (a real safety investigation works from safety_events/support_tickets, not someone''s private address book). Soft-deleted, not hard-deleted, to preserve an audit trail of additions/removals. Max 5 active contacts and no duplicate phone per user, enforced by trusted_contacts_enforce_limits().';

drop policy "trusted_contacts_all_own" on public.trusted_contacts;
create policy "trusted_contacts_all_own" on public.trusted_contacts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.trusted_contacts_enforce_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_count integer;
begin
  select count(*) into v_active_count
  from public.trusted_contacts
  where user_id = new.user_id and deleted_at is null;

  if v_active_count >= 5 then
    raise exception 'You can have at most 5 emergency contacts. Remove one before adding another.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.trusted_contacts
    where user_id = new.user_id and deleted_at is null and phone = new.phone
  ) then
    -- P0001 (generic raise_exception), not 23505 (unique_violation) —
    -- PostgREST special-cases native Postgres constraint-violation SQLSTATEs
    -- and does not reliably forward this RAISE's literal message text for
    -- them the way it does for a plain P0001, confirmed live: the API
    -- response's `message` field came back as PostgREST's own generic
    -- wording instead of this sentence. Matches the P0001 used just above
    -- for the contact-limit case, and elsewhere in this codebase (e.g.
    -- create_ride_share's "Cannot share a ride that has already ended").
    raise exception 'This phone number is already saved as an emergency contact.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.trusted_contacts_enforce_limits() is 'BEFORE INSERT guard on trusted_contacts: max 5 active contacts per user, no duplicate active phone number per user. SECURITY DEFINER only so it can read other (soft-deleted) rows of the same user for the count regardless of caller privilege — it never reads across users, and it inserts nothing itself.';

create trigger trusted_contacts_enforce_limits
  before insert on public.trusted_contacts
  for each row execute function public.trusted_contacts_enforce_limits();

-- ----------------------------------------------------------------------------
-- create_ride_share() must be re-created (not just left alone) because its
-- body references trusted_contacts.passenger_id, which no longer exists.
-- Everything else about the function is byte-for-byte unchanged from
-- 20260818090300_ride_shares.sql.
-- ----------------------------------------------------------------------------
create or replace function public.create_ride_share(
  p_ride_id uuid,
  p_trusted_contact_id uuid default null,
  p_duration_hours integer default 4
)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ride public.rides;
  v_token text;
  v_share_id uuid;
  v_expires timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  select r.* into v_ride from public.rides r where r.id = p_ride_id;
  if v_ride.id is null then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if v_ride.passenger_id is distinct from auth.uid() then
    raise exception 'Caller does not own this ride' using errcode = '42501';
  end if;

  if v_ride.status in ('ride_completed', 'cancelled', 'rated') then
    raise exception 'Cannot share a ride that has already ended' using errcode = 'P0001';
  end if;

  if p_trusted_contact_id is not null then
    if not exists (select 1 from public.trusted_contacts where id = p_trusted_contact_id and user_id = auth.uid() and deleted_at is null) then
      raise exception 'Trusted contact not found' using errcode = 'P0002';
    end if;
  end if;

  v_expires := now() + (least(greatest(p_duration_hours, 1), 12) || ' hours')::interval;
  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.ride_shares (ride_id, passenger_id, trusted_contact_id, token, expires_at)
  values (p_ride_id, auth.uid(), p_trusted_contact_id, v_token, v_expires)
  returning ride_shares.id into v_share_id;

  insert into public.ride_events (ride_id, event_type, actor_type, actor_id, payload)
  values (p_ride_id, 'ride_shared', 'passenger', auth.uid(), jsonb_build_object('share_id', v_share_id));

  return query select v_share_id, v_token, v_expires;
end;
$$;
