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

-- 0) Missing dependency: client_access table (used by RLS policies below)
-- Maps which app_user can access which client.
CREATE TABLE IF NOT EXISTS public.client_access (
  user_id   UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_client_access_client_id ON public.client_access(client_id);
CREATE INDEX IF NOT EXISTS idx_client_access_user_id ON public.client_access(user_id);

-- Enable RLS on client_access
ALTER TABLE public.client_access ENABLE ROW LEVEL SECURITY;

-- client_access policies
DROP POLICY IF EXISTS "client_access_select_self" ON public.client_access;
CREATE POLICY "client_access_select_self"
  ON public.client_access FOR SELECT
  USING (
    user_id = (auth.jwt() ->> 'sub')::uuid
  );

DROP POLICY IF EXISTS "client_access_admin_all" ON public.client_access;
CREATE POLICY "client_access_admin_all"
  ON public.client_access FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Enable RLS
ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tag_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies for document_folders
DROP POLICY IF EXISTS "Users can view folders for their clients" ON public.document_folders;
CREATE POLICY "Users can view folders for their clients"
  ON public.document_folders FOR SELECT
  USING (
    client_id IN (
      SELECT ca.client_id
      FROM public.client_access ca
      WHERE ca.user_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

DROP POLICY IF EXISTS "Users can create folders for their clients" ON public.document_folders;
CREATE POLICY "Users can create folders for their clients"
  ON public.document_folders FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT ca.client_id
      FROM public.client_access ca
      WHERE ca.user_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

DROP POLICY IF EXISTS "Users can update folders for their clients" ON public.document_folders;
CREATE POLICY "Users can update folders for their clients"
  ON public.document_folders FOR UPDATE
  USING (
    client_id IN (
      SELECT ca.client_id
      FROM public.client_access ca
      WHERE ca.user_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

DROP POLICY IF EXISTS "Users can delete folders for their clients" ON public.document_folders;
CREATE POLICY "Users can delete folders for their clients"
  ON public.document_folders FOR DELETE
  USING (
    client_id IN (
      SELECT ca.client_id
      FROM public.client_access ca
      WHERE ca.user_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

-- RLS Policies for document_tags
DROP POLICY IF EXISTS "Users can view tags for their clients" ON public.document_tags;
CREATE POLICY "Users can view tags for their clients"
  ON public.document_tags FOR SELECT
  USING (
    client_id IN (
      SELECT ca.client_id
      FROM public.client_access ca
      WHERE ca.user_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

DROP POLICY IF EXISTS "Users can create tags for their clients" ON public.document_tags;
CREATE POLICY "Users can create tags for their clients"
  ON public.document_tags FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT ca.client_id
      FROM public.client_access ca
      WHERE ca.user_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

DROP POLICY IF EXISTS "Users can delete tags for their clients" ON public.document_tags;
CREATE POLICY "Users can delete tags for their clients"
  ON public.document_tags FOR DELETE
  USING (
    client_id IN (
      SELECT ca.client_id
      FROM public.client_access ca
      WHERE ca.user_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

-- RLS Policies for document_tag_links
DROP POLICY IF EXISTS "Users can view tag links for their documents" ON public.document_tag_links;
CREATE POLICY "Users can view tag links for their documents"
  ON public.document_tag_links FOR SELECT
  USING (
    document_id IN (
      SELECT d.id
      FROM public.documents d
      JOIN public.client_access ca ON d.client_id = ca.client_id
      WHERE ca.user_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

DROP POLICY IF EXISTS "Users can create tag links for their documents" ON public.document_tag_links;
CREATE POLICY "Users can create tag links for their documents"
  ON public.document_tag_links FOR INSERT
  WITH CHECK (
    document_id IN (
      SELECT d.id
      FROM public.documents d
      JOIN public.client_access ca ON d.client_id = ca.client_id
      WHERE ca.user_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

DROP POLICY IF EXISTS "Users can delete tag links for their documents" ON public.document_tag_links;
CREATE POLICY "Users can delete tag links for their documents"
  ON public.document_tag_links FOR DELETE
  USING (
    document_id IN (
      SELECT d.id
      FROM public.documents d
      JOIN public.client_access ca ON d.client_id = ca.client_id
      WHERE ca.user_id = (auth.jwt() ->> 'sub')::uuid
    )
  );
