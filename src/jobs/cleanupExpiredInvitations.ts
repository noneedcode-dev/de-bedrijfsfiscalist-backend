// src/jobs/cleanupExpiredInvitations.ts
import { createSupabaseAdminClient } from '../lib/supabaseClient';
import { logger } from '../config/logger';

/**
 * Cleanup expired invitations
 * Marks invitations as 'expired' if they are past their expiration date
 * and still in 'pending' status
 */
export async function cleanupExpiredInvitations(): Promise<void> {
  const startTime = Date.now();
  logger.info('Starting cleanup of expired invitations...');

  try {
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    // Update expired invitations
    const { data, error } = await supabase
      .from('invitations')
      .update({
        status: 'expired',
        updated_at: now,
      })
      .eq('status', 'pending')
      .lt('expires_at', now)
      .select('id, email, expires_at');

    if (error) {
      throw new Error(`Failed to update expired invitations: ${error.message}`);
    }

    const count = data?.length ?? 0;
    const duration = Date.now() - startTime;

    if (count > 0) {
      logger.info(`✅ Cleaned up ${count} expired invitation(s)`, {
        count,
        duration: `${duration}ms`,
        invitations: data?.map(inv => ({
          id: inv.id,
          email: inv.email,
          expiredAt: inv.expires_at,
        })),
      });
    } else {
      logger.debug('No expired invitations to clean up', {
        duration: `${duration}ms`,
      });
    }
  } catch (error) {
    logger.error('Failed to cleanup expired invitations', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
