import { createSupabaseAdminClient } from '../lib/supabaseClient';
import { logger } from '../config/logger';

export interface AuditLogEntry {
  client_id?: string;
  actor_user_id?: string;
  actor_role?: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, any>;
}

export interface AuditLogInsert {
  client_id?: string;
  actor_user_id?: string;
  actor_role?: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, any>;
}

class AuditLogService {
  private supabase = createSupabaseAdminClient();

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      const sanitizedMetadata = this.sanitizeMetadata(entry.metadata);

      const insertData: AuditLogInsert = {
        client_id: entry.client_id,
        actor_user_id: entry.actor_user_id,
        actor_role: entry.actor_role,
        action: entry.action,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        metadata: sanitizedMetadata,
      };

      const { error } = await this.supabase
        .from('audit_logs')
        .insert(insertData);

      if (error) {
        logger.error('Failed to insert audit log', {
          error: error.message,
          action: entry.action,
          entity_type: entry.entity_type,
        });
      } else {
        logger.debug('Audit log inserted', {
          action: entry.action,
          entity_type: entry.entity_type,
          entity_id: entry.entity_id,
        });
      }
    } catch (err) {
      logger.error('Unexpected error in audit log service', {
        error: err instanceof Error ? err.message : String(err),
        action: entry.action,
      });
    }
  }

  logAsync(entry: AuditLogEntry): void {
    this.log(entry).catch((err) => {
      logger.error('Audit log async error', {
        error: err instanceof Error ? err.message : String(err),
        action: entry.action,
      });
    });
  }

  private sanitizeMetadata(
    metadata?: Record<string, any>
  ): Record<string, any> | undefined {
    if (!metadata) return undefined;

    const sensitiveKeys = [
      'password',
      'token',
      'secret',
      'api_key',
      'apiKey',
      'access_token',
      'refresh_token',
      'authorization',
      'cookie',
      'session',
      'private_key',
      'privateKey',
    ];

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(metadata)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some((sensitive) =>
        lowerKey.includes(sensitive)
      );

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeMetadata(value as Record<string, any>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

export const auditLogService = new AuditLogService();
