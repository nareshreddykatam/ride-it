-- ============================================================================
-- 20260831090000_support_ticket_lifecycle.sql
--
-- support_tickets (Phase 3) already has everything needed for creation
-- (category, status, subject, description, ride_id, reported_user_id,
-- severity, assigned_admin_id) — the gap is entirely on the READ/MANAGE
-- side: updateSupportTicketStatus() is a plain client UPDATE (fine, RLS
-- already secures it via support_tickets_all_admin), but there is no
-- audit trail of who changed what/when, and no way to leave an internal
-- note without destroying the ticket's own description. This migration
-- adds exactly that — the same safety_event_notes pattern (migration
-- 20260829090200), reused for a second, unrelated entity rather than
-- inventing a different shape for the same concept.
--
-- Ticket ASSIGNMENT (assigned_admin_id) deliberately gets no new RPC —
-- it's already a plain admin-gated column write via support_tickets_all_admin,
-- exactly the "plain table writes are fine when RLS already secures them"
-- convention this codebase's own admin.ts documents at its top.
-- ============================================================================

create table public.support_ticket_notes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  admin_id uuid references public.admin_users (id) on delete set null,
  note text,
  status_transition_to public.support_ticket_status_enum,
  created_at timestamptz not null default now()
);

create index support_ticket_notes_ticket_idx on public.support_ticket_notes (ticket_id, created_at);

comment on table public.support_ticket_notes is 'Append-only audit trail for a support_tickets row: every status transition and every free-standing internal admin note, in order. Admin-only — the ticket''s own filer never sees these (mirrors safety_event_notes'' privacy boundary); they see only the ticket''s own status via support_tickets_select_own.';

alter table public.support_ticket_notes enable row level security;

create policy "support_ticket_notes_all_admin" on public.support_ticket_notes
  for all using (public.is_admin()) with check (public.is_admin());

alter publication supabase_realtime add table public.support_ticket_notes;

create or replace function public.set_support_ticket_status(
  p_ticket_id uuid,
  p_status public.support_ticket_status_enum,
  p_note text default null
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
begin
  if not public.is_admin() then
    raise exception 'Only admins may change a support ticket''s status' using errcode = '42501';
  end if;

  update public.support_tickets
  set status = p_status,
      resolved_at = case when p_status in ('resolved', 'closed') and resolved_at is null then now() else resolved_at end
  where id = p_ticket_id
  returning * into v_ticket;

  if v_ticket.id is null then
    raise exception 'Support ticket not found' using errcode = 'P0002';
  end if;

  insert into public.support_ticket_notes (ticket_id, admin_id, note, status_transition_to)
  values (p_ticket_id, auth.uid(), nullif(trim(coalesce(p_note, '')), ''), p_status);

  if v_ticket.user_id is not null then
    perform public._create_notification(
      v_ticket.user_id,
      'system',
      'Your support ticket was updated',
      format('Your ticket "%s" is now: %s.', v_ticket.subject, p_status),
      jsonb_build_object('ticket_id', v_ticket.id)
    );
  end if;

  return v_ticket;
end;
$$;

revoke execute on function public.set_support_ticket_status(uuid, public.support_ticket_status_enum, text) from public;
grant execute on function public.set_support_ticket_status(uuid, public.support_ticket_status_enum, text) to authenticated;

comment on function public.set_support_ticket_status(uuid, public.support_ticket_status_enum, text) is 'Admin-only status transition. Every call appends a support_ticket_notes audit row and notifies the filer (if the ticket still has one — user_id is SET NULL on account deletion).';

create or replace function public.add_support_ticket_note(p_ticket_id uuid, p_note text)
returns public.support_ticket_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.support_ticket_notes;
begin
  if not public.is_admin() then
    raise exception 'Only admins may add a note to a support ticket' using errcode = '42501';
  end if;

  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'Note text is required' using errcode = '22023';
  end if;

  if not exists (select 1 from public.support_tickets where id = p_ticket_id) then
    raise exception 'Support ticket not found' using errcode = 'P0002';
  end if;

  insert into public.support_ticket_notes (ticket_id, admin_id, note)
  values (p_ticket_id, auth.uid(), trim(p_note))
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.add_support_ticket_note(uuid, text) from public;
grant execute on function public.add_support_ticket_note(uuid, text) to authenticated;

comment on function public.add_support_ticket_note(uuid, text) is 'Admin-only free-standing audit-trail note with no status change. Distinct from set_support_ticket_status() so a note can be logged without forcing a state transition.';
