-- Migration: Add document folders and tags
-- PR-7: Document organization with folders and tags

-- 1) Create document_folders table
CREATE TABLE IF NOT EXISTS public.document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT NULL,
  UNIQUE(client_id, name)
);

-- 2) Create document_tags table
CREATE TABLE IF NOT EXISTS public.document_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, name)
);

-- 3) Create document_tag_links table
CREATE TABLE IF NOT EXISTS public.document_tag_links (
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.document_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
);

-- 4) Add folder_id to documents table
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS folder_id UUID NULL REFERENCES public.document_folders(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_folders_client_id ON public.document_folders(client_id);
CREATE INDEX IF NOT EXISTS idx_document_tags_client_id ON public.document_tags(client_id);
CREATE INDEX IF NOT EXISTS idx_document_tag_links_document_id ON public.document_tag_links(document_id);
CREATE INDEX IF NOT EXISTS idx_document_tag_links_tag_id ON public.document_tag_links(tag_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON public.documents(folder_id);

-- Enable RLS
ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tag_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies for document_folders
CREATE POLICY "Users can view folders for their clients"
  ON public.document_folders FOR SELECT
  USING (
    client_id IN (
      SELECT ca.client_id 
      FROM public.client_access ca
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create folders for their clients"
  ON public.document_folders FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT ca.client_id 
      FROM public.client_access ca
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update folders for their clients"
  ON public.document_folders FOR UPDATE
  USING (
    client_id IN (
      SELECT ca.client_id 
      FROM public.client_access ca
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete folders for their clients"
  ON public.document_folders FOR DELETE
  USING (
    client_id IN (
      SELECT ca.client_id 
      FROM public.client_access ca
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

-- RLS Policies for document_tags
CREATE POLICY "Users can view tags for their clients"
  ON public.document_tags FOR SELECT
  USING (
    client_id IN (
      SELECT ca.client_id 
      FROM public.client_access ca
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create tags for their clients"
  ON public.document_tags FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT ca.client_id 
      FROM public.client_access ca
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tags for their clients"
  ON public.document_tags FOR DELETE
  USING (
    client_id IN (
      SELECT ca.client_id 
      FROM public.client_access ca
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

-- RLS Policies for document_tag_links
CREATE POLICY "Users can view tag links for their documents"
  ON public.document_tag_links FOR SELECT
  USING (
    document_id IN (
      SELECT d.id 
      FROM public.documents d
      JOIN public.client_access ca ON d.client_id = ca.client_id
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create tag links for their documents"
  ON public.document_tag_links FOR INSERT
  WITH CHECK (
    document_id IN (
      SELECT d.id 
      FROM public.documents d
      JOIN public.client_access ca ON d.client_id = ca.client_id
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tag links for their documents"
  ON public.document_tag_links FOR DELETE
  USING (
    document_id IN (
      SELECT d.id 
      FROM public.documents d
      JOIN public.client_access ca ON d.client_id = ca.client_id
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );
-- Migration: Add document preview support (PR-8)
-- Description: Adds preview metadata fields to documents table and creates job queue table

-- ============================================================================
-- 1. Add preview fields to documents table
-- ============================================================================

ALTER TABLE public.documents
ADD COLUMN preview_status text NULL CHECK (preview_status IN ('pending', 'ready', 'failed')),
ADD COLUMN preview_storage_key text NULL,
ADD COLUMN preview_mime_type text NULL,
ADD COLUMN preview_size bigint NULL,
ADD COLUMN preview_updated_at timestamptz NULL,
ADD COLUMN preview_error text NULL;

COMMENT ON COLUMN public.documents.preview_status IS 'Status of preview generation: pending, ready, or failed';
COMMENT ON COLUMN public.documents.preview_storage_key IS 'Storage path for preview thumbnail (webp format)';
COMMENT ON COLUMN public.documents.preview_mime_type IS 'MIME type of preview (typically image/webp)';
COMMENT ON COLUMN public.documents.preview_size IS 'Size of preview file in bytes';
COMMENT ON COLUMN public.documents.preview_updated_at IS 'Timestamp when preview was last updated';
COMMENT ON COLUMN public.documents.preview_error IS 'Last error message if preview generation failed (truncated to 500 chars)';

-- Add index for querying documents by preview status
CREATE INDEX idx_documents_preview_status ON public.documents(preview_status) WHERE preview_status IS NOT NULL;

-- ============================================================================
-- 2. Create document_preview_jobs table for job queue
-- ============================================================================

CREATE TABLE public.document_preview_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text NULL,
  locked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id)
);

COMMENT ON TABLE public.document_preview_jobs IS 'Queue for document preview generation jobs';
COMMENT ON COLUMN public.document_preview_jobs.status IS 'Job status: pending, processing, done, or failed';
COMMENT ON COLUMN public.document_preview_jobs.attempts IS 'Number of processing attempts';
COMMENT ON COLUMN public.document_preview_jobs.last_error IS 'Last error message if job failed';
COMMENT ON COLUMN public.document_preview_jobs.locked_at IS 'Timestamp when job was locked for processing';

-- Indexes for efficient job processing
CREATE INDEX idx_preview_jobs_status ON public.document_preview_jobs(status);
CREATE INDEX idx_preview_jobs_pending ON public.document_preview_jobs(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_preview_jobs_document_id ON public.document_preview_jobs(document_id);

-- ============================================================================
-- 3. RLS Policies for document_preview_jobs
-- ============================================================================

-- Enable RLS
ALTER TABLE public.document_preview_jobs ENABLE ROW LEVEL SECURITY;

-- Admin users can do everything
CREATE POLICY "Admin users can manage all preview jobs"
  ON public.document_preview_jobs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.user_id = auth.uid()
      AND app_users.role = 'admin'
    )
  );

-- Client users can view their own client's preview jobs
CREATE POLICY "Client users can view their preview jobs"
  ON public.document_preview_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.user_id = auth.uid()
      AND app_users.client_id = document_preview_jobs.client_id
    )
  );

-- ============================================================================
-- 4. Function to automatically update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_preview_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_preview_jobs_updated_at
  BEFORE UPDATE ON public.document_preview_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_preview_jobs_updated_at();

-- ============================================================================
-- 5. Helper function to enqueue preview job (idempotent)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_document_preview_job(
  p_client_id uuid,
  p_document_id uuid
)
RETURNS uuid AS $$
DECLARE
  v_job_id uuid;
BEGIN
  -- Insert or get existing job (idempotent)
  INSERT INTO public.document_preview_jobs (client_id, document_id, status)
  VALUES (p_client_id, p_document_id, 'pending')
  ON CONFLICT (document_id) DO NOTHING
  RETURNING id INTO v_job_id;
  
  -- If job already existed, get its ID
  IF v_job_id IS NULL THEN
    SELECT id INTO v_job_id
    FROM public.document_preview_jobs
    WHERE document_id = p_document_id;
  END IF;
  
  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.enqueue_document_preview_job IS 'Idempotently enqueue a preview generation job for a document';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.enqueue_document_preview_job TO authenticated;
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
-- Migration: Add messaging tables for client-admin communication
-- Created: 2026-01-22
-- Description: Creates client_conversations, messages, and message_attachments tables with RLS policies

-- 1. Create client_conversations table (single thread per client)
CREATE TABLE IF NOT EXISTS public.client_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

-- 2. Create indexes for client_conversations
CREATE INDEX IF NOT EXISTS idx_client_conversations_client_id ON public.client_conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_client_conversations_last_message_at_desc ON public.client_conversations(last_message_at DESC);

-- 3. Add comments for documentation
COMMENT ON TABLE public.client_conversations IS 'Conversation threads between clients and admins (one per client)';
COMMENT ON COLUMN public.client_conversations.client_id IS 'Foreign key to clients table (unique constraint ensures single thread per client)';
COMMENT ON COLUMN public.client_conversations.last_message_at IS 'Timestamp of the most recent message in this conversation';

-- 4. Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_client_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger for updated_at
CREATE TRIGGER client_conversations_updated_at_trigger
  BEFORE UPDATE ON public.client_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_conversations_updated_at();

-- 6. Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.client_conversations(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES public.app_users(id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('admin', 'client')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Create indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_client_id_created_at_desc ON public.messages(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at_asc ON public.messages(conversation_id, created_at ASC);

-- 8. Add comments for messages table
COMMENT ON TABLE public.messages IS 'Messages exchanged between clients and admins';
COMMENT ON COLUMN public.messages.client_id IS 'Denormalized client_id for efficient filtering and export';
COMMENT ON COLUMN public.messages.sender_user_id IS 'User who sent the message';
COMMENT ON COLUMN public.messages.sender_role IS 'Role of the sender at the time of sending (admin or client)';
COMMENT ON COLUMN public.messages.body IS 'Plain text message content (max 10000 chars enforced at API layer)';

-- 9. Create message_attachments table
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, document_id)
);

-- 10. Create indexes for message_attachments
CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id ON public.message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_client_id ON public.message_attachments(client_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_document_id ON public.message_attachments(document_id);

-- 11. Add comments for message_attachments table
COMMENT ON TABLE public.message_attachments IS 'Links messages to document attachments';
COMMENT ON COLUMN public.message_attachments.client_id IS 'Denormalized client_id for ownership validation';
COMMENT ON COLUMN public.message_attachments.document_id IS 'Reference to document in documents table';

-- 12. Enable Row Level Security on all tables
ALTER TABLE public.client_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

-- 13. RLS Policies for client_conversations

-- Client users can view their own conversation
DROP POLICY IF EXISTS "client_conversations_client_select_own" ON public.client_conversations;
CREATE POLICY "client_conversations_client_select_own"
ON public.client_conversations
FOR SELECT
USING (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- Client users can insert their own conversation
DROP POLICY IF EXISTS "client_conversations_client_insert_own" ON public.client_conversations;
CREATE POLICY "client_conversations_client_insert_own"
ON public.client_conversations
FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- Client users can update their own conversation
DROP POLICY IF EXISTS "client_conversations_client_update_own" ON public.client_conversations;
CREATE POLICY "client_conversations_client_update_own"
ON public.client_conversations
FOR UPDATE
USING (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
)
WITH CHECK (
  client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- Admin has full access to all conversations
DROP POLICY IF EXISTS "client_conversations_admin_full_access" ON public.client_conversations;
CREATE POLICY "client_conversations_admin_full_access"
ON public.client_conversations
FOR ALL
USING (
  auth.jwt() ->> 'role' = 'admin'
)
WITH CHECK (
  auth.jwt() ->> 'role' = 'admin'
);

-- Service role can do everything (for backend operations)
DROP POLICY IF EXISTS "client_conversations_service_role_full_access" ON public.client_conversations;
CREATE POLICY "client_conversations_service_role_full_access"
ON public.client_conversations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 14. RLS Policies for messages

-- Client users can view messages in their conversation
DROP POLICY IF EXISTS "messages_client_select_own" ON public.messages;
CREATE POLICY "messages_client_select_own"
ON public.messages
FOR SELECT
USING (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- Client users can insert messages in their conversation
DROP POLICY IF EXISTS "messages_client_insert_own" ON public.messages;
CREATE POLICY "messages_client_insert_own"
ON public.messages
FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- Admin has full access to all messages
DROP POLICY IF EXISTS "messages_admin_full_access" ON public.messages;
CREATE POLICY "messages_admin_full_access"
ON public.messages
FOR ALL
USING (
  auth.jwt() ->> 'role' = 'admin'
)
WITH CHECK (
  auth.jwt() ->> 'role' = 'admin'
);

-- Service role can do everything (for backend operations)
DROP POLICY IF EXISTS "messages_service_role_full_access" ON public.messages;
CREATE POLICY "messages_service_role_full_access"
ON public.messages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 15. RLS Policies for message_attachments

-- Client users can view attachments in their messages
DROP POLICY IF EXISTS "message_attachments_client_select_own" ON public.message_attachments;
CREATE POLICY "message_attachments_client_select_own"
ON public.message_attachments
FOR SELECT
USING (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- Client users can insert attachments in their messages
DROP POLICY IF EXISTS "message_attachments_client_insert_own" ON public.message_attachments;
CREATE POLICY "message_attachments_client_insert_own"
ON public.message_attachments
FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- Admin has full access to all message attachments
DROP POLICY IF EXISTS "message_attachments_admin_full_access" ON public.message_attachments;
CREATE POLICY "message_attachments_admin_full_access"
ON public.message_attachments
FOR ALL
USING (
  auth.jwt() ->> 'role' = 'admin'
)
WITH CHECK (
  auth.jwt() ->> 'role' = 'admin'
);

-- Service role can do everything (for backend operations)
DROP POLICY IF EXISTS "message_attachments_service_role_full_access" ON public.message_attachments;
CREATE POLICY "message_attachments_service_role_full_access"
ON public.message_attachments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
