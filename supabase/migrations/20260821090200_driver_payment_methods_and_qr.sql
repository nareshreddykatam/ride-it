-- ============================================================================
-- 20260821090200_driver_payment_methods_and_qr.sql
--
-- Two related additions, both extending the EXISTING `drivers` table
-- rather than creating new tables (there are only ever three fixed
-- payment methods and one QR image per driver -- a full child table would
-- be duplicate structure for data that is genuinely 1:1 with a driver row,
-- exactly the "do not create duplicate tables" instruction):
--
-- 1. Driver payment-method preferences (cash/driver_upi/online) -- plain
--    boolean columns, self-editable by the driver via the EXISTING
--    drivers_update_own RLS policy, same as upi_id already is. Not added
--    to protect_driver_system_columns() -- choosing which methods you
--    accept is a legitimate self-service preference, not a
--    self-approval of a verification outcome (unlike upi_verified).
--
-- 2. Driver UPI QR upload + admin verification -- mirrors the EXISTING
--    upi_id/upi_verified/upi_verified_at/reset_upi_verification_on_change
--    pattern (20260816090000_payment_method_and_financial_protection.sql)
--    as closely as possible: a private storage bucket scoped by
--    driver-owned folder (mirroring driver-documents' RLS shape exactly),
--    a status column protected by protect_driver_system_columns() so a
--    driver can never self-approve, and a reset-on-replace trigger so a
--    replaced QR always goes back to 'pending' review rather than
--    silently keeping a stale 'approved' status.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Payment-method preferences
-- ----------------------------------------------------------------------------
alter table public.drivers add column accepts_cash boolean not null default true;
alter table public.drivers add column accepts_driver_upi boolean not null default false;
alter table public.drivers add column accepts_online boolean not null default false;

comment on column public.drivers.accepts_cash is 'Driver-editable payment-method preference. Defaults true -- cash requires no setup, matching how every driver could already accept it implicitly before this migration.';
comment on column public.drivers.accepts_driver_upi is 'Driver-editable payment-method preference. A passenger can only actually select driver_upi if this is true AND upi_verified is true AND (once uploaded) the QR is upi_qr_status=''approved'' -- enforced server-side in the payment-selection RPC (Phase E), not here.';
comment on column public.drivers.accepts_online is 'Driver-editable payment-method preference for Razorpay/online payment.';

-- ----------------------------------------------------------------------------
-- 2. UPI QR upload + verification (reuses driver_verification_status_enum
--    rather than inventing a new enum type for the same pending/approved/
--    rejected shape -- 'in_review'/'suspended' are simply never used for
--    a QR image, but reusing the existing type avoids a duplicate type).
-- ----------------------------------------------------------------------------
alter table public.drivers add column upi_qr_path text;
alter table public.drivers add column upi_qr_status public.driver_verification_status_enum not null default 'pending';
alter table public.drivers add column upi_qr_uploaded_at timestamptz;
alter table public.drivers add column upi_qr_reviewed_by uuid references public.admin_users (id) on delete set null;
alter table public.drivers add column upi_qr_reviewed_at timestamptz;
alter table public.drivers add column upi_qr_rejection_reason text;

comment on column public.drivers.upi_qr_path is 'Storage path within the private driver-payment-qr bucket, own-folder RLS-scoped exactly like driver-documents. Null until the driver uploads a QR image.';
comment on column public.drivers.upi_qr_status is 'Admin-verification status of the currently-uploaded QR image. Protected by protect_driver_system_columns() -- a driver cannot set this directly, only trusted-write functions (this migration''s upload path) or an admin session (admin.ts review action) can.';

alter table public.drivers add constraint drivers_upi_qr_rejection_reason_required
  check (upi_qr_status <> 'rejected' or upi_qr_rejection_reason is not null);

-- ----------------------------------------------------------------------------
-- reset_upi_qr_status_on_change(): mirrors reset_upi_verification_on_change
-- exactly -- whenever upi_qr_path changes (a new upload/replacement), the
-- status is forced back to 'pending' and the prior review stamps cleared,
-- server-side, so a driver can never keep a stale 'approved' status on a
-- newly-replaced image. Runs as a BEFORE UPDATE trigger; fires AFTER
-- protect_driver_system_columns in Postgres's alphabetical trigger-name
-- ordering ('p' < 'r'), so protect_driver_system_columns evaluates the
-- CLIENT's own submitted change (upi_qr_path only -- never upi_qr_status
-- directly) before this trigger's own internal NEW.upi_qr_status write
-- happens -- identical, already-proven ordering to how
-- reset_upi_verification_on_change safely coexists with the same
-- protection trigger today.
-- ----------------------------------------------------------------------------
create or replace function public.reset_upi_qr_status_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.upi_qr_path is distinct from old.upi_qr_path then
    new.upi_qr_status := 'pending';
    new.upi_qr_reviewed_by := null;
    new.upi_qr_reviewed_at := null;
    new.upi_qr_rejection_reason := null;
  end if;
  return new;
end;
$$;

create trigger reset_upi_qr_status_on_change
  before update on public.drivers
  for each row execute function public.reset_upi_qr_status_on_change();

comment on function public.reset_upi_qr_status_on_change() is 'Forces upi_qr_status back to pending (and clears review stamps) whenever upi_qr_path changes -- a driver replacing their QR image can never keep a prior approval. Mirrors reset_upi_verification_on_change for upi_id exactly.';

-- ----------------------------------------------------------------------------
-- Extend protect_driver_system_columns() to also protect the QR
-- verification outcome columns -- same shape as the existing
-- upi_verified/upi_verified_at protection added in
-- 20260816090000_payment_method_and_financial_protection.sql. upi_qr_path
-- itself is deliberately NOT in this list -- the driver must be able to
-- set it directly (that's the upload action itself); only the
-- ADMIN-DECIDED verification outcome is protected.
-- ----------------------------------------------------------------------------
create or replace function public.protect_driver_system_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('ride_it.trusted_write', true), 'false') = 'true'
     or public.is_admin() then
    return new;
  end if;

  if new.verification_status is distinct from old.verification_status
     or new.rating is distinct from old.rating
     or new.strike_count is distinct from old.strike_count
     or new.total_rides is distinct from old.total_rides
     or new.verification_notes is distinct from old.verification_notes
     or new.upi_verified is distinct from old.upi_verified
     or new.upi_verified_at is distinct from old.upi_verified_at
     or new.upi_qr_status is distinct from old.upi_qr_status
     or new.upi_qr_reviewed_by is distinct from old.upi_qr_reviewed_by
     or new.upi_qr_reviewed_at is distinct from old.upi_qr_reviewed_at
     or new.upi_qr_rejection_reason is distinct from old.upi_qr_rejection_reason
  then
    raise exception 'Cannot modify protected driver fields directly' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.protect_driver_system_columns() is 'Blocks direct driver self-modification of verification_status/rating/strike_count/total_rides/verification_notes/upi_verified/upi_verified_at/upi_qr_status/upi_qr_reviewed_by/upi_qr_reviewed_at/upi_qr_rejection_reason, regardless of write path. upi_qr_path, accepts_cash/accepts_driver_upi/accepts_online, vehicle_type, current_city_id, current_location, and is_online remain driver-editable.';

-- ----------------------------------------------------------------------------
-- Storage: private driver-payment-qr bucket, RLS shaped identically to
-- the existing driver-documents bucket (20260806090000) -- own-folder
-- select/insert/update/delete by auth.uid(), plus admin read-all. A
-- dedicated bucket rather than reusing driver-documents, since QR
-- verification is a distinct review workflow (payment info, not KYC).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('driver-payment-qr', 'driver-payment-qr', false)
on conflict (id) do nothing;

create policy "driver_payment_qr_storage_select_own" on storage.objects
  for select using (bucket_id = 'driver-payment-qr' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "driver_payment_qr_storage_insert_own" on storage.objects
  for insert with check (bucket_id = 'driver-payment-qr' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "driver_payment_qr_storage_update_own" on storage.objects
  for update using (bucket_id = 'driver-payment-qr' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "driver_payment_qr_storage_delete_own" on storage.objects
  for delete using (bucket_id = 'driver-payment-qr' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "driver_payment_qr_storage_select_admin" on storage.objects
  for select using (bucket_id = 'driver-payment-qr' and public.is_admin());

comment on policy "driver_payment_qr_storage_select_own" on storage.objects is 'Path convention: driver-payment-qr/<driver_id>/<filename> -- storage.foldername(name)[1] is the driver_id folder segment, same convention as driver-documents.';
