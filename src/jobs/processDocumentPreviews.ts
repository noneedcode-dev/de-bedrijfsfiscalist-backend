import { createSupabaseAdminClient } from '../lib/supabaseClient';
import { logger } from '../config/logger';
import { generatePreview, isSupportedForPreview } from '../lib/previewGenerator';
import { auditLogService } from '../services/auditLogService';
import { AuditActions } from '../constants/auditActions';

interface PreviewJob {
  id: string;
  client_id: string;
  document_id: string;
  status: string;
  attempts: number;
  last_error: string | null;
}

const MAX_ATTEMPTS = 3;
const PROCESSING_TIMEOUT_MS = 60000;

export async function processDocumentPreviews(): Promise<void> {
  const adminSupabase = createSupabaseAdminClient();

  try {
    const job = await claimNextPendingJob();
    
    if (!job) {
      return;
    }

    logger.info('Processing preview job', { 
      jobId: job.id, 
      documentId: job.document_id,
      attempt: job.attempts + 1 
    });

    try {
      await processJob(job);
      
      await adminSupabase
        .from('document_preview_jobs')
        .update({ 
          status: 'done',
          locked_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);

      logger.info('Preview job completed successfully', { 
        jobId: job.id, 
        documentId: job.document_id 
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const truncatedError = errorMessage.substring(0, 500);
      
      logger.error('Preview job failed', { 
        jobId: job.id, 
        documentId: job.document_id,
        error: errorMessage,
        attempts: job.attempts + 1
      });

      const newAttempts = job.attempts + 1;
      const shouldRetry = newAttempts < MAX_ATTEMPTS;

      await adminSupabase
        .from('document_preview_jobs')
        .update({
          status: shouldRetry ? 'pending' : 'failed',
          attempts: newAttempts,
          last_error: truncatedError,
          locked_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);

      await adminSupabase
        .from('documents')
        .update({
          preview_status: 'failed',
          preview_error: truncatedError,
          preview_updated_at: new Date().toISOString()
        })
        .eq('id', job.document_id);

      auditLogService.logAsync({
        client_id: job.client_id,
        action: AuditActions.DOCUMENT_PREVIEW_FAILED,
        entity_type: 'document',
        entity_id: job.document_id,
        metadata: {
          job_id: job.id,
          error: truncatedError,
          attempts: newAttempts,
          will_retry: shouldRetry
        }
      });
    }

  } catch (error) {
    logger.error('Error in preview job processor', { error });
  }
}

async function claimNextPendingJob(): Promise<PreviewJob | null> {
  const adminSupabase = createSupabaseAdminClient();

  const { data: jobs, error } = await adminSupabase
    .from('document_preview_jobs')
    .select('*')
    .eq('status', 'pending')
    .is('locked_at', null)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    logger.error('Failed to fetch pending jobs', { error });
    return null;
  }

  if (!jobs || jobs.length === 0) {
    return null;
  }

  const job = jobs[0];

  const { error: updateError } = await adminSupabase
    .from('document_preview_jobs')
    .update({
      status: 'processing',
      locked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', job.id)
    .eq('status', 'pending');

  if (updateError) {
    logger.error('Failed to claim job', { jobId: job.id, error: updateError });
    return null;
  }

  return job as PreviewJob;
}

async function processJob(job: PreviewJob): Promise<void> {
  const adminSupabase = createSupabaseAdminClient();

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Processing timeout')), PROCESSING_TIMEOUT_MS);
  });

  await Promise.race([
    processJobInternal(job, adminSupabase),
    timeoutPromise
  ]);
}

async function processJobInternal(job: PreviewJob, adminSupabase: any): Promise<void> {
  const { data: document, error: docError } = await adminSupabase
    .from('documents')
    .select('id, client_id, storage_path, mime_type, name')
    .eq('id', job.document_id)
    .maybeSingle();

  if (docError || !document) {
    throw new Error(`Document not found: ${docError?.message || 'Not found'}`);
  }

  if (!isSupportedForPreview(document.mime_type)) {
    throw new Error(`Unsupported file type: ${document.mime_type}`);
  }

  const { data: fileData, error: downloadError } = await adminSupabase.storage
    .from('documents')
    .download(document.storage_path);

  if (downloadError || !fileData) {
    throw new Error(`Failed to download file: ${downloadError?.message || 'No data'}`);
  }

  const fileBuffer = Buffer.from(await fileData.arrayBuffer());

  const preview = await generatePreview(fileBuffer, document.mime_type);

  const previewKey = `clients/${document.client_id}/documents/${document.id}/preview.webp`;

  const { error: uploadError } = await adminSupabase.storage
    .from('documents')
    .upload(previewKey, preview.buffer, {
      contentType: preview.mimeType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload preview: ${uploadError.message}`);
  }

  const { error: updateError } = await adminSupabase
    .from('documents')
    .update({
      preview_status: 'ready',
      preview_storage_key: previewKey,
      preview_mime_type: preview.mimeType,
      preview_size: preview.size,
      preview_updated_at: new Date().toISOString(),
      preview_error: null
    })
    .eq('id', document.id);

  if (updateError) {
    throw new Error(`Failed to update document: ${updateError.message}`);
  }

  auditLogService.logAsync({
    client_id: job.client_id,
    action: AuditActions.DOCUMENT_PREVIEW_READY,
    entity_type: 'document',
    entity_id: job.document_id,
    metadata: {
      job_id: job.id,
      preview_storage_key: previewKey,
      preview_size: preview.size,
      preview_mime_type: preview.mimeType,
      original_mime_type: document.mime_type
    }
  });
}
