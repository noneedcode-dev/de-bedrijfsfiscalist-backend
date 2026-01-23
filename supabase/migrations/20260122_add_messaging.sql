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
