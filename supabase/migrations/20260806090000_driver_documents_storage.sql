-- ============================================================================
-- 20260806090000_driver_documents_storage.sql
-- Phase 6 addition. Creates the private storage bucket driver_documents.ts
-- (packages/supabase/src/storage.ts, Phase 2) was always written to expect,
-- but which never actually existed until now — Phase 2 only prepared the
-- helper functions, not the bucket itself, since no upload flow existed to
-- need it yet.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('driver-documents', 'driver-documents', false)
on conflict (id) do nothing;

-- Path convention: driver-documents/<driver_id>/<document_type>.<ext>
-- storage.foldername(name) splits the object path into an array of path
-- segments — [1] is the first folder, i.e. the driver_id.

create policy "driver_documents_storage_select_own" on storage.objects
  for select using (
    bucket_id = 'driver-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "driver_documents_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'driver-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "driver_documents_storage_update_own" on storage.objects
  for update using (
    bucket_id = 'driver-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "driver_documents_storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'driver-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins review documents — need to read every driver's folder, not just
-- their own (there is no "own" folder for an admin in this bucket).
create policy "driver_documents_storage_select_admin" on storage.objects
  for select using (bucket_id = 'driver-documents' and public.is_admin());

comment on policy "driver_documents_storage_select_own" on storage.objects is
  'Path convention driver-documents/<driver_id>/<file> — a driver can only read/write inside their own driver_id folder.';
