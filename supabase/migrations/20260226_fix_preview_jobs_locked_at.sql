-- Migration: Fix missing locked_at column in document_preview_jobs
-- Description: Add locked_at column if it doesn't exist (production hotfix)

-- Add locked_at column if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'document_preview_jobs' 
      AND column_name = 'locked_at'
  ) THEN
    ALTER TABLE public.document_preview_jobs
    ADD COLUMN locked_at timestamptz NULL;
    
    COMMENT ON COLUMN public.document_preview_jobs.locked_at IS 'Timestamp when job was locked for processing';
    
    RAISE NOTICE 'Added locked_at column to document_preview_jobs';
  ELSE
    RAISE NOTICE 'locked_at column already exists in document_preview_jobs';
  END IF;
END $$;
