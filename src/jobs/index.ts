// src/jobs/index.ts
import cron from 'node-cron';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { cleanupExpiredInvitations } from './cleanupExpiredInvitations';

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

  // Job 1: Cleanup expired invitations (runs daily at 2 AM)
  cron.schedule('0 2 * * *', async () => {
    logger.info('⏰ Running scheduled job: cleanup expired invitations');
    try {
      await cleanupExpiredInvitations();
    } catch (error) {
      logger.error('Failed to run cleanup expired invitations job', { error });
    }
  });

  // Job 2: Health check / keep-alive (runs every hour)
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
