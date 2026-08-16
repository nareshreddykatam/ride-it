-- ============================================================================
-- 20260806090400_replace_driver_document_function.sql
-- Phase 3 gave drivers no UPDATE policy on driver_documents at all — "Drivers
-- may NOT update status/reviewed_by/reviewed_at themselves — only admins
-- review documents" (Phase 3 review doc). Re-uploading after a rejection
-- needs to soft-delete the previous row (the partial unique index
-- driver_documents_one_current_per_type_idx only allows one non-deleted row
-- per driver+type) — a plain client UPDATE can't do that under the existing
-- policy. This RPC does exactly the one thing a driver should be allowed to
-- do here (retire their own old document row when uploading a replacement)
-- without granting a general UPDATE policy that could touch status/
-- rejection_reason/reviewed_by.
-- ============================================================================

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
  'Retires the caller''s previous document of this type (soft delete) and inserts the new pending one, atomically. The only document-row mutation a driver can perform themselves — status/rejection_reason/reviewed_by remain admin-only via driver_documents_all_admin.';

grant execute on function public.replace_driver_document(public.document_type_enum, text) to authenticated;
