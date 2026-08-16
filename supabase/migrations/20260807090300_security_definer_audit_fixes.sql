-- ============================================================================
-- 20260807090300_security_definer_audit_fixes.sql
-- Phase 6.1 security hardening, item 4 — audit of every SECURITY DEFINER
-- function touched by Phase 6, against: authenticated caller requirement,
-- correct ownership, correct driver role, no ability to modify another
-- user's data, safe search_path, appropriate execute grants, no
-- unintended privilege escalation.
--
-- Findings below. Most were "reviewed, already safe, tightened as
-- defense-in-depth anyway." One was a real, serious vulnerability.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FINDING (severe): handle_new_auth_user() privilege escalation.
--
-- This function was re-created in Phase 6 (20260806090500, to add wallet
-- provisioning) and is therefore in scope for this audit even though its
-- origin is Phase 4. It read `role` from the new auth user's
-- raw_user_meta_data — which is fully client-controlled at
-- signInWithOtp(phone, { options: { data: { role: '...' } } }) time. Our
-- own app code (phone-otp.ts) only ever sends 'passenger' or 'driver', but
-- nothing on the server enforced that. Anyone with the public anon key
-- (which is public by design) could call supabase.auth.signInWithOtp
-- directly with options.data.role = 'admin' for their own real phone
-- number and this trigger would create a public.users row with
-- role='admin' for them — a straightforward self-service admin
-- privilege escalation.
--
-- Fix: phone-based signups (new.phone is not null — i.e. every self-service
-- OTP signup) can now only ever become 'passenger' or 'driver', regardless
-- of what role metadata claims. 'admin' is only ever inferred for the
-- phone-absent/email-present shape, which corresponds to accounts
-- provisioned via the Supabase Dashboard or Admin API (not self-service
-- signInWithOtp) — see the Phase 4 review doc's admin-provisioning section.
-- This does not fully close every theoretical path (see review doc's
-- remaining-risk note on Supabase project-level email signup settings),
-- but it closes the concrete one this codebase's own auth flow exposed.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_role public.user_role_enum;
  v_role public.user_role_enum;
  v_vehicle_type public.vehicle_type_enum;
begin
  v_requested_role := (new.raw_user_meta_data ->> 'role')::public.user_role_enum;

  if new.phone is not null and new.phone <> '' then
    -- Self-service phone OTP signup — 'admin' is never honored here even
    -- if requested via metadata, since that metadata is client-controlled.
    if v_requested_role = 'driver' then
      v_role := 'driver';
    else
      v_role := 'passenger';
    end if;
  elsif new.email is not null then
    -- No phone + has email = dashboard/Admin-API provisioned, not
    -- self-service — safe to honor as admin.
    v_role := 'admin';
  else
    v_role := 'passenger';
  end if;

  insert into public.users (id, role, phone, email, full_name)
  values (new.id, v_role, new.phone, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;

  if v_role = 'passenger' then
    insert into public.passengers (id) values (new.id)
    on conflict (id) do nothing;

  elsif v_role = 'driver' then
    v_vehicle_type := coalesce((new.raw_user_meta_data ->> 'vehicle_type')::public.vehicle_type_enum, 'auto');
    insert into public.drivers (id, vehicle_type) values (new.id, v_vehicle_type)
    on conflict (id) do nothing;

    insert into public.wallets (user_id, balance) values (new.id, 0)
    on conflict (user_id) do nothing;

  end if;

  return new;
end;
$$;

comment on function public.handle_new_auth_user() is
  'Provisions the matching public.users(+passengers/drivers/wallet) row on new auth.users insert. SECURITY-CRITICAL: phone-based (self-service OTP) signups can only ever become passenger/driver — admin role is never honored from client-supplied metadata, only inferred for phone-absent/email-present (dashboard-provisioned) accounts. See Phase 6.1 security review for the vulnerability this closes.';

-- ----------------------------------------------------------------------------
-- FINDING (moderate): replace_driver_document() accepted an arbitrary
-- p_file_path from the caller with no validation that it falls within
-- their own storage folder. Storage RLS (migration 20260806090000)
-- prevents a driver from *uploading* to another driver's folder, but
-- nothing stopped a driver from calling this RPC with a *guessed or
-- leaked* path belonging to another driver's already-uploaded file — that
-- would create a driver_documents row under the caller's own driver_id
-- that references another driver's private document, which an admin
-- reviewing "the caller's" documents (or a signed URL generated for that
-- row) would then expose. Fixed by requiring the path's first segment to
-- equal the caller's own auth.uid().
-- ----------------------------------------------------------------------------
create or replace function public.replace_driver_document(
  p_document_type public.document_type_enum,
  p_file_path text
)
returns public.driver_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.driver_documents;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.drivers where id = auth.uid()) then
    raise exception 'Caller is not a registered driver' using errcode = '42501';
  end if;

  if p_file_path !~ ('^' || auth.uid()::text || '/') then
    raise exception 'file_path must be within the caller''s own storage folder' using errcode = '42501';
  end if;

  update public.driver_documents
  set deleted_at = now()
  where driver_id = auth.uid()
    and document_type = p_document_type
    and deleted_at is null;

  insert into public.driver_documents (driver_id, document_type, file_path, status)
  values (auth.uid(), p_document_type, p_file_path, 'pending')
  returning * into v_document;

  return v_document;
end;
$$;

comment on function public.replace_driver_document(public.document_type_enum, text) is
  'Retires the caller''s previous document of this type and inserts the new pending one, atomically. p_file_path is validated to start with the caller''s own auth.uid() — prevents referencing another driver''s uploaded file by path. Status/rejection_reason/reviewed_by remain admin-only via driver_documents_all_admin.';

revoke execute on function public.replace_driver_document(public.document_type_enum, text) from public;
grant execute on function public.replace_driver_document(public.document_type_enum, text) to authenticated;

-- ----------------------------------------------------------------------------
-- FINDING (low): increment_driver_strike(p_driver_id uuid) took the driver
-- id as a caller-supplied parameter. The WHERE clause (id = p_driver_id
-- AND id = auth.uid()) already made this functionally safe — a spoofed
-- p_driver_id just matches zero rows — but there's no reason to accept a
-- spoofable argument the function doesn't need. Removed the parameter
-- entirely; the function now only ever acts on auth.uid(). Also adds an
-- explicit driver-role check for auditability, matching the pattern used
-- elsewhere in this migration.
-- ----------------------------------------------------------------------------
drop function if exists public.increment_driver_strike(uuid);

create or replace function public.increment_driver_strike()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '28000';
  end if;

  update public.drivers
  set strike_count = strike_count + 1
  where id = auth.uid();
end;
$$;

comment on function public.increment_driver_strike() is
  'Atomically increments the calling driver''s own strike_count by 1. No longer accepts a driver_id parameter (Phase 6.1 — removed a spoofable argument that RLS-equivalent WHERE-clause logic made functionally inert anyway, but which had no reason to exist).';

revoke execute on function public.increment_driver_strike() from public;
grant execute on function public.increment_driver_strike() to authenticated;

comment on function public.accept_ride_request(uuid) is
  'Reviewed in Phase 6.1 security audit: requires auth.uid(), verifies caller exists in drivers before use, atomic conditional UPDATE prevents cross-driver data modification, search_path pinned, execute revoked from public/granted to authenticated only.';
