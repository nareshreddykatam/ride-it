-- ============================================================================
-- 0010_notifications_and_support.sql
-- ============================================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type public.notification_type_enum not null,
  channel public.notification_channel_enum not null default 'push',
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint notifications_read_at_requires_is_read
    check (not is_read or read_at is not null)
);

-- The one query every notifications screen makes: "my unread notifications,
-- newest first." Partial + composite index shaped exactly for that.
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc)
  where is_read = false and deleted_at is null;
create index notifications_user_all_idx on public.notifications (user_id, created_at desc)
  where deleted_at is null;

create trigger set_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();

comment on table public.notifications is 'In-app notification records. Actual push/SMS delivery happens via an external provider (FCM/SMS gateway) — this table is the in-app inbox + delivery-intent record, not the delivery mechanism itself.';

-- ----------------------------------------------------------------------------
-- support_tickets — user_id is SET NULL (not RESTRICT/CASCADE): a support
-- ticket has standalone value as a record even if the reporting user's
-- account is later removed; ride_id likewise SET NULL since not every
-- ticket is ride-related (category = 'account', 'other', etc.).
-- ----------------------------------------------------------------------------
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  ride_id uuid references public.rides (id) on delete set null,
  category public.support_ticket_category_enum not null default 'other',
  status public.support_ticket_status_enum not null default 'open',
  subject text not null,
  description text,
  assigned_admin_id uuid references public.admin_users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint support_tickets_resolved_at_requires_resolved_status
    check (status not in ('resolved', 'closed') or resolved_at is not null)
);

create index support_tickets_status_idx on public.support_tickets (status, created_at desc);
create index support_tickets_user_idx on public.support_tickets (user_id);
create index support_tickets_assigned_admin_idx on public.support_tickets (assigned_admin_id) where status in ('open', 'in_progress');

create trigger set_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

comment on table public.support_tickets is 'Support/complaint queue. ride_id is nullable — not every ticket (e.g. category=account) relates to a specific ride.';
