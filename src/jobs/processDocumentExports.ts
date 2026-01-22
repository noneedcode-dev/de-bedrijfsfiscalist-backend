import { createSupabaseAdminClient } from '../lib/supabaseClient';
import { logger } from '../config/logger';
import { auditLogService } from '../services/auditLogService';
import { AuditActions } from '../constants/auditActions';
import archiver from 'archiver';

interface ExportJob {
  id: string;
  client_id: string;
  created_by: string | null;
  status: string;
  document_ids: string[];
  storage_key: string | null;
  error: string | null;
}

const PROCESSING_TIMEOUT_MS = 300000;

export async function processDocumentExports(): Promise<void> {
  const adminSupabase = createSupabaseAdminClient();

  try {
    const job = await claimNextPendingJob();
    
    if (!job) {
      return;
    }

    logger.info('Processing export job', { 
      jobId: job.id, 
      clientId: job.client_id,
      documentCount: job.document_ids.length
    });

    try {
      await processJob(job);
      
      logger.info('Export job completed successfully', { 
        jobId: job.id, 
        clientId: job.client_id 
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const truncatedError = errorMessage.substring(0, 500);
      
      logger.error('Export job failed', { 
        jobId: job.id, 
        clientId: job.client_id,
        error: errorMessage
      });

      await adminSupabase
        .from('document_exports')
        .update({
          status: 'failed',
          error: truncatedError,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);

      auditLogService.logAsync({
        client_id: job.client_id,
        actor_user_id: job.created_by || undefined,
        action: AuditActions.DOCUMENT_EXPORT_FAILED,
        entity_type: 'document_export',
        entity_id: job.id,
        metadata: {
          error: truncatedError,
          document_count: job.document_ids.length
        }
      });
    }

  } catch (error) {
    logger.error('Error in export job processor', { error });
  }
}

async function claimNextPendingJob(): Promise<ExportJob | null> {
  const adminSupabase = createSupabaseAdminClient();

  const { data: jobs, error } = await adminSupabase
    .from('document_exports')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    logger.error('Failed to fetch pending export jobs', { error });
    return null;
  }

  if (!jobs || jobs.length === 0) {
    return null;
  }

  const job = jobs[0];

  const { error: updateError } = await adminSupabase
    .from('document_exports')
    .update({
      status: 'processing',
      updated_at: new Date().toISOString()
    })
    .eq('id', job.id)
    .eq('status', 'pending');

  if (updateError) {
    logger.error('Failed to claim export job', { jobId: job.id, error: updateError });
    return null;
  }

  return job as ExportJob;
}

async function processJob(job: ExportJob): Promise<void> {
  const adminSupabase = createSupabaseAdminClient();

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Processing timeout')), PROCESSING_TIMEOUT_MS);
  });

  await Promise.race([
    processJobInternal(job, adminSupabase),
    timeoutPromise
  ]);
}

async function processJobInternal(job: ExportJob, adminSupabase: any): Promise<void> {
  const { data: documents, error: docError } = await adminSupabase
    .from('documents')
    .select('id, client_id, storage_path, name')
    .eq('client_id', job.client_id)
    .in('id', job.document_ids)
    .is('deleted_at', null);

  if (docError) {
    throw new Error(`Failed to fetch documents: ${docError.message}`);
  }

  if (!documents || documents.length === 0) {
    throw new Error('No valid documents found for export');
  }

  if (documents.length !== job.document_ids.length) {
    logger.warn('Some documents not found or deleted', {
      requested: job.document_ids.length,
      found: documents.length
    });
  }

  const archive = archiver('zip', {
    zlib: { level: 6 }
  });

  const chunks: Buffer[] = [];
  
  archive.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
  });

  const archivePromise = new Promise<Buffer>((resolve, reject) => {
    archive.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    archive.on('error', (err) => {
      reject(err);
    });
  });

  for (const document of documents) {
    const { data: fileData, error: downloadError } = await adminSupabase.storage
      .from('documents')
      .download(document.storage_path);

    if (downloadError || !fileData) {
      logger.warn('Failed to download document, skipping', {
        documentId: document.id,
        error: downloadError?.message
      });
      continue;
    }

    const fileBuffer = Buffer.from(await fileData.arrayBuffer());
    archive.append(fileBuffer, { name: document.name });
  }

  archive.finalize();

  const zipBuffer = await archivePromise;

  const zipKey = `clients/${job.client_id}/exports/${job.id}/export.zip`;

  const { error: uploadError } = await adminSupabase.storage
    .from('documents')
    .upload(zipKey, zipBuffer, {
      contentType: 'application/zip',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload ZIP: ${uploadError.message}`);
  }

  const { error: updateError } = await adminSupabase
    .from('document_exports')
    .update({
      status: 'ready',
      storage_key: zipKey,
      updated_at: new Date().toISOString()
    })
    .eq('id', job.id);

  if (updateError) {
    throw new Error(`Failed to update export status: ${updateError.message}`);
  }

  auditLogService.logAsync({
    client_id: job.client_id,
    actor_user_id: job.created_by || undefined,
    action: AuditActions.DOCUMENT_EXPORT_READY,
    entity_type: 'document_export',
    entity_id: job.id,
    metadata: {
      storage_key: zipKey,
      document_count: documents.length,
      zip_size: zipBuffer.length
    }
  });
}
