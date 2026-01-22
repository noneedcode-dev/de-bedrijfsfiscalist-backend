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
