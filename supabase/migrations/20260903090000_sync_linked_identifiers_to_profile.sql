-- ============================================================================
-- 20260903090000_sync_linked_identifiers_to_profile.sql
--
-- Closes the gap between Supabase Auth's identity layer and this
-- product's own profile table for the "add a second verified identifier
-- to an existing account" flow (Supabase's official mechanism:
-- auth.updateUser({ phone | email }) followed by
-- auth.verifyOtp({ type: 'phone_change' | 'email_change' })).
--
-- handle_new_auth_user() (20260804090000, evolved since) already syncs
-- phone/email into public.users, but only on INSERT into auth.users —
-- i.e. only at original signup. When an already-authenticated user later
-- links a second identifier via updateUser()/verifyOtp(), GoTrue UPDATEs
-- the SAME auth.users row (phone or email column) — no INSERT fires, so
-- public.users silently drifts out of sync with the identifier the
-- account can actually now log in with, until the user happens to also
-- edit their profile's contact fields by hand.
--
-- This trigger is the AFTER UPDATE counterpart: whenever auth.users.phone
-- or auth.users.email actually changes, it mirrors the new value into
-- public.users using the exact same normalization
-- handle_new_auth_user() already uses (right(phone, 10) — auth.users
-- stores phone as bare E.164 digits, e.g. "917000000002"; public.users'
-- own CHECK constraint expects the 10-digit local form).
--
-- Deliberately narrow: only phone/email are synced. Does not touch role,
-- is_active, deleted_at, or any other public.users column — those remain
-- exclusively governed by protect_users_system_columns (unchanged) and
-- this trigger's own UPDATE never sets them, so that protection is not
-- bypassed (it only guards changes to those specific columns, which this
-- trigger never makes).
-- ============================================================================

create or replace function public.sync_linked_identifier_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phone is distinct from old.phone or new.email is distinct from old.email then
    update public.users
    set phone = case when new.phone is not null then right(new.phone, 10) else phone end,
        email = coalesce(new.email, email)
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_identifier_updated on auth.users;
create trigger on_auth_user_identifier_updated
  after update of phone, email on auth.users
  for each row execute function public.sync_linked_identifier_to_profile();

comment on function public.sync_linked_identifier_to_profile() is 'Mirrors auth.users.phone/email into public.users whenever either changes post-signup (e.g. via auth.updateUser()+verifyOtp() identity linking) — the AFTER UPDATE counterpart to handle_new_auth_user()''s AFTER INSERT sync. Never touches role/is_active/deleted_at/referral_code, so protect_users_system_columns remains the sole authority over those.';
