-- Migration: Add document folders and tags (FIXED - without client_access)
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

-- RLS Policies for document_folders (FIXED)
CREATE POLICY "Users can view folders for their clients"
  ON public.document_folders FOR SELECT
  USING (
    client_id IN (
      SELECT au.client_id 
      FROM public.app_users au
      WHERE au.id = auth.uid()
    )
  );

CREATE POLICY "Users can manage folders for their clients"
  ON public.document_folders FOR ALL
  WITH CHECK (
    client_id IN (
      SELECT au.client_id 
      FROM public.app_users au
      WHERE au.id = auth.uid()
    )
  );

-- RLS Policies for document_tags (FIXED)
CREATE POLICY "Users can view tags for their clients"
  ON public.document_tags FOR SELECT
  USING (
    client_id IN (
      SELECT au.client_id 
      FROM public.app_users au
      WHERE au.id = auth.uid()
    )
  );

CREATE POLICY "Users can manage tags for their clients"
  ON public.document_tags FOR ALL
  USING (
    client_id IN (
      SELECT au.client_id 
      FROM public.app_users au
      WHERE au.id = auth.uid()
    )
  );

-- RLS Policies for document_tag_links (FIXED)
CREATE POLICY "Users can view tag links for their documents"
  ON public.document_tag_links FOR SELECT
  USING (
    document_id IN (
      SELECT d.id 
      FROM public.documents d
      JOIN public.app_users au ON d.client_id = au.client_id
      WHERE au.id = auth.uid()
    )
  );

CREATE POLICY "Users can manage tag links for their documents"
  ON public.document_tag_links FOR ALL
  WITH CHECK (
    document_id IN (
      SELECT d.id 
      FROM public.documents d
      JOIN public.app_users au ON d.client_id = au.client_id
      WHERE au.id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tag links for their documents"
  ON public.document_tag_links FOR DELETE
  USING (
    document_id IN (
      SELECT d.id 
      FROM public.documents d
      JOIN public.app_users au ON d.client_id = au.client_id
      WHERE au.id = auth.uid()
    )
  );

-- ============================================================================
-- DOCUMENT PREVIEWS MIGRATION
-- ============================================================================

-- 1. Add preview columns to documents table
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS preview_status text NULL CHECK (preview_status IN ('pending', 'ready', 'failed')),
ADD COLUMN IF NOT EXISTS preview_storage_key text NULL,
ADD COLUMN IF NOT EXISTS preview_mime_type text NULL,
ADD COLUMN IF NOT EXISTS preview_size bigint NULL,
ADD COLUMN IF NOT EXISTS preview_updated_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS preview_error text NULL;

COMMENT ON COLUMN public.documents.preview_status IS 'Status of preview generation: pending, ready, or failed';
COMMENT ON COLUMN public.documents.preview_storage_key IS 'Storage path for preview thumbnail (webp format)';
COMMENT ON COLUMN public.documents.preview_mime_type IS 'MIME type of preview (typically image/webp)';
COMMENT ON COLUMN public.documents.preview_size IS 'Size of preview file in bytes';
COMMENT ON COLUMN public.documents.preview_updated_at IS 'Timestamp when preview was last updated';
COMMENT ON COLUMN public.documents.preview_error IS 'Last error message if preview generation failed (truncated to 500 chars)';

-- Add index for querying documents by preview status
CREATE INDEX IF NOT EXISTS idx_documents_preview_status ON public.documents(preview_status) WHERE preview_status IS NOT NULL;

-- 2. Create document_preview_jobs table for job queue
CREATE TABLE IF NOT EXISTS public.document_preview_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id)
);

-- Indexes for job processing
CREATE INDEX IF NOT EXISTS idx_document_preview_jobs_status ON public.document_preview_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_document_preview_jobs_client ON public.document_preview_jobs(client_id);

-- Enable RLS
ALTER TABLE public.document_preview_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for document_preview_jobs
CREATE POLICY "Admin can view all preview jobs"
  ON public.document_preview_jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'admin'
    )
  );

CREATE POLICY "Client users can view their preview jobs"
  ON public.document_preview_jobs FOR SELECT
  USING (
    client_id IN (
      SELECT client_id FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'client'
    )
  );

-- 3. Function to claim preview job atomically
CREATE OR REPLACE FUNCTION claim_document_preview_job()
RETURNS TABLE (
  id uuid,
  client_id uuid,
  document_id uuid,
  status text,
  attempts int,
  last_error text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.document_preview_jobs
  SET 
    status = 'processing',
    attempts = attempts + 1,
    updated_at = NOW()
  WHERE document_preview_jobs.id = (
    SELECT document_preview_jobs.id
    FROM public.document_preview_jobs
    WHERE status IN ('pending', 'failed')
      AND attempts < 3
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING 
    document_preview_jobs.id,
    document_preview_jobs.client_id,
    document_preview_jobs.document_id,
    document_preview_jobs.status,
    document_preview_jobs.attempts,
    document_preview_jobs.last_error,
    document_preview_jobs.created_at,
    document_preview_jobs.updated_at;
END;
$$;

-- ============================================================================
-- DOCUMENT SOFT DELETE MIGRATION
-- ============================================================================

-- Add soft delete columns to documents table
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS deleted_by uuid NULL REFERENCES public.app_users(id);

COMMENT ON COLUMN public.documents.deleted_at IS 'Timestamp when document was soft deleted';
COMMENT ON COLUMN public.documents.deleted_by IS 'User who deleted the document';

-- Add index for querying non-deleted documents
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON public.documents(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================================
-- MESSAGING SYSTEM MIGRATION
-- ============================================================================

-- 1. Conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_client_id ON public.conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON public.conversations(updated_at DESC);

-- 2. Conversation participants table
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON public.conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id ON public.conversation_participants(conversation_id);

-- 3. Messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);

-- 4. Message read receipts table
CREATE TABLE IF NOT EXISTS public.message_read_receipts (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_read_receipts_user_id ON public.message_read_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_message_read_receipts_message_id ON public.message_read_receipts(message_id);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations
CREATE POLICY "Users can view conversations they participate in"
  ON public.conversations FOR SELECT
  USING (
    id IN (
      SELECT conversation_id 
      FROM public.conversation_participants
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create conversations for their client"
  ON public.conversations FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT client_id 
      FROM public.app_users
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update conversations they participate in"
  ON public.conversations FOR UPDATE
  USING (
    id IN (
      SELECT conversation_id 
      FROM public.conversation_participants
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for conversation_participants
CREATE POLICY "Users can view participants in their conversations"
  ON public.conversation_participants FOR SELECT
  USING (
    conversation_id IN (
      SELECT conversation_id 
      FROM public.conversation_participants
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add participants to their conversations"
  ON public.conversation_participants FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT conversation_id 
      FROM public.conversation_participants
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for messages
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT conversation_id 
      FROM public.conversation_participants
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can send messages to their conversations"
  ON public.messages FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT conversation_id 
      FROM public.conversation_participants
      WHERE user_id = auth.uid()
    )
    AND sender_id = auth.uid()
  );

CREATE POLICY "Users can update their own messages"
  ON public.messages FOR UPDATE
  USING (sender_id = auth.uid());

-- RLS Policies for message_read_receipts
CREATE POLICY "Users can view read receipts in their conversations"
  ON public.message_read_receipts FOR SELECT
  USING (
    message_id IN (
      SELECT m.id 
      FROM public.messages m
      JOIN public.conversation_participants cp ON m.conversation_id = cp.conversation_id
      WHERE cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can mark messages as read"
  ON public.message_read_receipts FOR INSERT
  WITH CHECK (
    message_id IN (
      SELECT m.id 
      FROM public.messages m
      JOIN public.conversation_participants cp ON m.conversation_id = cp.conversation_id
      WHERE cp.user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );

-- 5. Function to get unread message count
CREATE OR REPLACE FUNCTION get_unread_message_count(p_user_id uuid, p_conversation_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.sender_id != p_user_id
    AND NOT EXISTS (
      SELECT 1 
      FROM public.message_read_receipts mrr
      WHERE mrr.message_id = m.id
        AND mrr.user_id = p_user_id
    );
  
  RETURN v_count;
END;
$$;
