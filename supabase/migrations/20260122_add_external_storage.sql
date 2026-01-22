-- Add external storage integration support
-- Migration: 20260122_add_external_storage.sql

-- 1. Create external_storage_connections table
CREATE TABLE IF NOT EXISTS public.external_storage_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'microsoft_graph')),
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'revoked', 'error')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scope TEXT,
  provider_account_id TEXT,
  root_folder_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, provider)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_external_storage_connections_client_provider 
  ON public.external_storage_connections(client_id, provider);

-- 2. Add external storage fields to documents table
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS external_provider TEXT CHECK (external_provider IN ('google_drive', 'microsoft_graph')),
  ADD COLUMN IF NOT EXISTS external_file_id TEXT,
  ADD COLUMN IF NOT EXISTS external_drive_id TEXT,
  ADD COLUMN IF NOT EXISTS external_web_url TEXT,
  ADD COLUMN IF NOT EXISTS external_sync_status TEXT CHECK (external_sync_status IN ('pending', 'synced', 'failed')),
  ADD COLUMN IF NOT EXISTS external_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS external_error TEXT;

-- Index for external sync status queries
CREATE INDEX IF NOT EXISTS idx_documents_external_sync_status 
  ON public.documents(external_sync_status) 
  WHERE external_sync_status IS NOT NULL;

-- 3. Create external_upload_jobs table
CREATE TABLE IF NOT EXISTS public.external_upload_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'microsoft_graph')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id)
);

-- Indexes for job processing
CREATE INDEX IF NOT EXISTS idx_external_upload_jobs_status 
  ON public.external_upload_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_external_upload_jobs_client 
  ON public.external_upload_jobs(client_id);

-- 4. Add client settings for external storage (if client_settings doesn't exist, create it)
CREATE TABLE IF NOT EXISTS public.client_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE UNIQUE,
  documents_mirror_provider TEXT CHECK (documents_mirror_provider IN ('google_drive', 'microsoft_graph')),
  documents_mirror_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- If client_settings already exists, add columns conditionally
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_settings') THEN
    ALTER TABLE public.client_settings
      ADD COLUMN IF NOT EXISTS documents_mirror_provider TEXT CHECK (documents_mirror_provider IN ('google_drive', 'microsoft_graph')),
      ADD COLUMN IF NOT EXISTS documents_mirror_enabled BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- 5. RLS Policies for external_storage_connections
ALTER TABLE public.external_storage_connections ENABLE ROW LEVEL SECURITY;

-- Admin can see all connections
CREATE POLICY "Admin can view all external storage connections"
  ON public.external_storage_connections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'admin'
    )
  );

-- Client users can only see their own client's connections
CREATE POLICY "Client users can view their client's external storage connections"
  ON public.external_storage_connections
  FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'client'
    )
  );

-- Admin can manage all connections
CREATE POLICY "Admin can manage all external storage connections"
  ON public.external_storage_connections
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'admin'
    )
  );

-- 6. RLS Policies for external_upload_jobs
ALTER TABLE public.external_upload_jobs ENABLE ROW LEVEL SECURITY;

-- Admin can see all jobs
CREATE POLICY "Admin can view all external upload jobs"
  ON public.external_upload_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'admin'
    )
  );

-- Client users can see their own client's jobs
CREATE POLICY "Client users can view their client's external upload jobs"
  ON public.external_upload_jobs
  FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'client'
    )
  );

-- 7. RLS Policies for client_settings
ALTER TABLE public.client_settings ENABLE ROW LEVEL SECURITY;

-- Admin can see all settings
CREATE POLICY "Admin can view all client settings"
  ON public.client_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'admin'
    )
  );

-- Client users can see their own settings
CREATE POLICY "Client users can view their client settings"
  ON public.client_settings
  FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'client'
    )
  );

-- Admin can manage all settings
CREATE POLICY "Admin can manage all client settings"
  ON public.client_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'admin'
    )
  );

-- 8. Function to enqueue external upload job
CREATE OR REPLACE FUNCTION enqueue_external_upload_job(
  p_client_id UUID,
  p_document_id UUID,
  p_provider TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Check if job already exists for this document
  SELECT id INTO v_job_id
  FROM public.external_upload_jobs
  WHERE document_id = p_document_id;
  
  IF v_job_id IS NOT NULL THEN
    RETURN v_job_id;
  END IF;
  
  -- Create new job
  INSERT INTO public.external_upload_jobs (client_id, document_id, provider)
  VALUES (p_client_id, p_document_id, p_provider)
  RETURNING id INTO v_job_id;
  
  RETURN v_job_id;
END;
$$;

-- 9. Atomic job claim function with SKIP LOCKED to prevent race conditions
CREATE OR REPLACE FUNCTION claim_external_upload_job()
RETURNS TABLE (
  id UUID,
  client_id UUID,
  document_id UUID,
  provider TEXT,
  status TEXT,
  attempts INT,
  last_error TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.external_upload_jobs
  SET 
    status = 'processing',
    updated_at = NOW()
  WHERE id = (
    SELECT external_upload_jobs.id
    FROM public.external_upload_jobs
    WHERE status IN ('pending', 'failed')
      AND attempts < 3
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING 
    external_upload_jobs.id,
    external_upload_jobs.client_id,
    external_upload_jobs.document_id,
    external_upload_jobs.provider,
    external_upload_jobs.status,
    external_upload_jobs.attempts,
    external_upload_jobs.last_error,
    external_upload_jobs.created_at,
    external_upload_jobs.updated_at;
END;
$$;
