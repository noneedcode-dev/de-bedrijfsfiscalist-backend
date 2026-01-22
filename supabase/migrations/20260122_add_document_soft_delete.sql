-- Migration: Add soft-delete support for documents
-- PR-6: Document soft-delete (archive) with safe storage cleanup
-- Created: 2026-01-22

-- Add soft-delete columns to documents table
alter table public.documents
  add column deleted_at timestamptz null,
  add column deleted_by text null;

-- Add index for efficient filtering of deleted documents
create index if not exists idx_documents_client_deleted 
  on public.documents(client_id, deleted_at);

-- Add comment for documentation
comment on column public.documents.deleted_at is 'Timestamp when document was soft-deleted (archived)';
comment on column public.documents.deleted_by is 'User ID (sub) who deleted the document';
comment on index idx_documents_client_deleted is 'Composite index for filtering active/deleted documents by client';
