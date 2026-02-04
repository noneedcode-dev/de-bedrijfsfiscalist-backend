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
    auth.jwt() ->> 'role' = 'admin'
  );

-- Client users can view their own client's preview jobs
CREATE POLICY "Client users can view their preview jobs"
  ON public.document_preview_jobs
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() ->> 'role' = 'client'
    AND client_id = (auth.jwt() ->> 'client_id')::uuid
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
