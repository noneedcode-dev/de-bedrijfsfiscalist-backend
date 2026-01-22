import { createSupabaseAdminClient } from '../lib/supabaseClient';
import { externalStorageService } from '../modules/externalStorage/externalStorageService';
import { auditLogService } from '../services/auditLogService';
import { AuditActions } from '../constants/auditActions';
import { logger } from '../config/logger';
import { ExternalUploadJob } from '../types/externalStorage';

const MAX_RETRIES = 3;
const BATCH_SIZE = 10;

export async function processExternalUploads(): Promise<void> {
  const adminSupabase = createSupabaseAdminClient();

  try {
    let processedCount = 0;

    for (let i = 0; i < BATCH_SIZE; i++) {
      const { data: jobs, error: claimError } = await adminSupabase.rpc('claim_external_upload_job');

      if (claimError) {
        logger.error('Failed to claim external upload job', { error: claimError });
        break;
      }

      if (!jobs || jobs.length === 0) {
        break;
      }

      const job = jobs[0];
      await processJob(job);
      processedCount++;
    }

    if (processedCount > 0) {
      logger.info(`Processed ${processedCount} external upload jobs`);
    } else {
      logger.debug('No external upload jobs to process');
    }
  } catch (error) {
    logger.error('Error in processExternalUploads', { error });
  }
}

async function processJob(job: ExternalUploadJob): Promise<void> {
  const adminSupabase = createSupabaseAdminClient();

  try {
    const { data: document, error: docError } = await adminSupabase
      .from('documents')
      .select('id, name, mime_type, storage_path')
      .eq('id', job.document_id)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${job.document_id}`);
    }

    const { data: fileData, error: downloadError } = await adminSupabase.storage
      .from('documents')
      .download(document.storage_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    const fileBuffer = Buffer.from(await fileData.arrayBuffer());

    const connection = await externalStorageService.getConnection(job.client_id, job.provider);
    if (!connection) {
      throw new Error(`No connection found for provider: ${job.provider}`);
    }

    if (connection.status !== 'connected') {
      throw new Error(`Connection is not active: ${connection.status}`);
    }

    const uploadResult = await externalStorageService.uploadFile(
      connection,
      fileBuffer,
      document.name,
      document.mime_type || 'application/octet-stream'
    );

    await adminSupabase
      .from('documents')
      .update({
        external_provider: job.provider,
        external_file_id: uploadResult.fileId,
        external_drive_id: uploadResult.driveId || null,
        external_web_url: uploadResult.webUrl || null,
        external_sync_status: 'synced',
        external_synced_at: new Date().toISOString(),
        external_error: null,
      })
      .eq('id', job.document_id);

    await adminSupabase
      .from('external_upload_jobs')
      .update({
        status: 'done',
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    auditLogService.logAsync({
      client_id: job.client_id,
      actor_user_id: undefined,
      actor_role: 'system',
      action: AuditActions.DOCUMENT_EXTERNAL_UPLOAD_SUCCEEDED,
      entity_type: 'document',
      entity_id: job.document_id,
      metadata: {
        provider: job.provider,
        external_file_id: uploadResult.fileId,
        external_web_url: uploadResult.webUrl,
        attempts: job.attempts + 1,
      },
    });

    logger.info('External upload succeeded', {
      jobId: job.id,
      documentId: job.document_id,
      provider: job.provider,
      fileId: uploadResult.fileId,
    });
  } catch (error: any) {
    const newAttempts = job.attempts + 1;
    const isFinalAttempt = newAttempts >= MAX_RETRIES;
    const newStatus = isFinalAttempt ? 'failed' : 'pending';

    logger.error('External upload failed', {
      jobId: job.id,
      documentId: job.document_id,
      provider: job.provider,
      attempts: newAttempts,
      error: error.message,
      isFinalAttempt,
    });

    await adminSupabase
      .from('external_upload_jobs')
      .update({
        status: newStatus,
        attempts: newAttempts,
        last_error: error.message?.substring(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    await adminSupabase
      .from('documents')
      .update({
        external_sync_status: 'failed',
        external_error: error.message?.substring(0, 500),
      })
      .eq('id', job.document_id);

    auditLogService.logAsync({
      client_id: job.client_id,
      actor_user_id: undefined,
      actor_role: 'system',
      action: AuditActions.DOCUMENT_EXTERNAL_UPLOAD_FAILED,
      entity_type: 'document',
      entity_id: job.document_id,
      metadata: {
        provider: job.provider,
        attempts: newAttempts,
        error: error.message?.substring(0, 200),
        is_final_attempt: isFinalAttempt,
      },
    });
  }
}
