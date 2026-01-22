// src/jobs/index.ts
import cron from 'node-cron';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { cleanupExpiredInvitations } from './cleanupExpiredInvitations';
import { processDocumentPreviews } from './processDocumentPreviews';
import { processDocumentExports } from './processDocumentExports';
import { processExternalUploads } from './processExternalUploads';

/**
 * Initialize and start all background jobs
 * Jobs are only started in production or when explicitly enabled
 */
export function initializeJobs(): void {
  const enableJobs = env.nodeEnv === 'production' || process.env.ENABLE_JOBS === 'true';

  if (!enableJobs) {
    logger.info('⏭️  Background jobs disabled (development mode)');
    return;
  }

  logger.info('🚀 Initializing background jobs...');

  // Job 1: Cleanup expired invitations (runs daily at 2 AM UTC)
  // NOTE: Container timezone is typically UTC in Railway/Vercel
  // To use a different timezone, set TZ environment variable (e.g., TZ=Europe/Amsterdam)
  cron.schedule('0 2 * * *', async () => {
    logger.info('⏰ Running scheduled job: cleanup expired invitations');
    try {
      await cleanupExpiredInvitations();
    } catch (error) {
      logger.error('Failed to run cleanup expired invitations job', { error });
    }
  });

  // Job 2: Process document preview generation (runs every 30 seconds)
  cron.schedule('*/30 * * * * *', async () => {
    try {
      await processDocumentPreviews();
    } catch (error) {
      logger.error('Failed to run document preview processor', { error });
    }
  });

  // Job 3: Process document exports (runs every 30 seconds)
  cron.schedule('*/30 * * * * *', async () => {
    try {
      await processDocumentExports();
    } catch (error) {
      logger.error('Failed to run document export processor', { error });
    }
  });

  // Job 4: Process external storage uploads (runs every 30 seconds)
  cron.schedule('*/30 * * * * *', async () => {
    try {
      await processExternalUploads();
    } catch (error) {
      logger.error('Failed to run external upload processor', { error });
    }
  });

  // Job 5: Health check / keep-alive (runs every hour)
  cron.schedule('0 * * * *', () => {
    logger.debug('⏰ Running scheduled job: health check');
    // Simple health check to keep the process alive
    // Can be extended to check database connectivity, etc.
  });

  logger.info('✅ Background jobs initialized successfully');
}

/**
 * Gracefully stop all background jobs
 */
export function stopJobs(): void {
  logger.info('🛑 Stopping background jobs...');
  // node-cron automatically handles cleanup on process exit
  // Additional cleanup logic can be added here if needed
}
