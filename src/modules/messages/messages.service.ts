// src/modules/messages/messages.service.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/errorHandler';
import { ErrorCodes } from '../../constants/errorCodes';
import { auditLogService } from '../../services/auditLogService';
import { AuditActions } from '../../constants/auditActions';
import { logger } from '../../config/logger';
import { DbMessage, DbClientConversation } from '../../types/database';

function throwSupabaseError(context: string, error: any) {
  if (!error) return;

  // Unique violation / duplicate key
  if (error.code === '23505') {
    throw AppError.fromCode(
      ErrorCodes.VALIDATION_FAILED,
      422,
      { message: `${context}: duplicate` }
    );
  }

  throw new AppError(`${context}: ${error.message ?? 'Unknown error'}`, 500);
}

/**
 * Fetch messages with cursor-based pagination
 */
export async function fetchMessages(
  supabase: SupabaseClient,
  clientId: string,
  limit: number,
  cursor?: string
): Promise<CursorPaginationResult> {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  // Apply cursor filter if provided
  if (cursor) {
    const { created_at: cursorCreatedAt, id: cursorId } = decodeCursor(cursor);

    // created_at < cursorCreatedAt OR (created_at = cursorCreatedAt AND id < cursorId)
    query = query.or(
      `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`
    );
  }

  const { data: messages, error } = await query;

  if (error) {
    throw new AppError('Failed to fetch messages', 500, ErrorCodes.INTERNAL_ERROR, error);
  }

  if (!messages || messages.length === 0) {
    return { items: [], next_cursor: null };
  }

  // Fetch attachments for all messages in batch
  const messageIds = messages.map((m) => m.id);
  const attachmentsMap = await fetchAttachmentsForMessages(supabase, messageIds);

  const items: MessageWithAttachments[] = messages.map((msg) => ({
    ...msg,
    attachments: attachmentsMap.get(msg.id) || [],
  } as MessageWithAttachments));

  const lastMessage = messages[messages.length - 1];
  const next_cursor = messages.length === limit
    ? encodeCursor(lastMessage.created_at, lastMessage.id)
    : null;

  return { items, next_cursor };
}

/**
 * Create a conversation
 */
export async function createConversation(
  supabase: SupabaseClient,
  clientId: string
): Promise<DbClientConversation> {
  // Try to insert new conversation
  const { data: inserted, error: insertError } = await supabase
    .from('client_conversations')
    .insert({
      client_id: clientId,
    })
    .select('id')
    .single();

  if (insertError) {
    throwSupabaseError('createConversation failed', insertError);
  }

  return inserted as DbClientConversation;
}

/**
 * Send a message (stores message record)
 */
export async function sendMessage(
  supabase: SupabaseClient,
  clientId: string,
  payload: Partial<DbMessage>
): Promise<DbMessage> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      client_id: clientId,
      ...payload,
    })
    .select('*')
    .single();

  if (error) {
    throwSupabaseError('sendMessage failed', error);
  }

  // Optional: audit log removed - caller will log with correct attachment_count
  return data as DbMessage;
}

/**
 * Link document attachments to a message
 * Expected behavior from tests:
 * - 23505 -> throw AppError(422, VALIDATION_FAILED)
 * - generic -> throw AppError(500)
 */
export async function linkAttachments(
  supabase: SupabaseClient,
  messageId: string,
  clientId: string,
  documentIds: string[]
): Promise<{ inserted: number }> {
  if (!Array.isArray(documentIds)) {
    throw AppError.fromCode(
      ErrorCodes.VALIDATION_FAILED,
      422,
      { message: 'documentIds must be an array' }
    );
  }

  const rows = documentIds.map((document_id) => ({
    message_id: messageId,
    client_id: clientId,
    document_id,
  }));

  const { error } = await supabase.from('message_attachments').insert(rows);

  if (error) {
    // tests want 422 for duplicate (23505)
    throwSupabaseError('linkAttachments failed', error);
  }

  return { inserted: rows.length };
}

export interface MessageAttachment {
  document_id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
}

export interface MessageWithAttachments extends DbMessage {
  attachments: MessageAttachment[];
}

export interface CursorPaginationResult {
  items: MessageWithAttachments[];
  next_cursor: string | null;
}

/**
 * Encode cursor from created_at timestamp and message id
 */
export function encodeCursor(created_at: string, id: string): string {
  const payload = `${created_at}|${id}`;
  return Buffer.from(payload).toString('base64');
}

/**
 * Decode cursor to extract created_at and id
 * @throws AppError with 422 if cursor is invalid
 */
export function decodeCursor(cursor: string): { created_at: string; id: string } {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const parts = decoded.split('|');

    if (parts.length !== 2) {
      throw new Error('Invalid cursor format');
    }

    const [created_at, id] = parts;

    // Validate ISO timestamp
    if (isNaN(Date.parse(created_at))) {
      throw new Error('Invalid timestamp in cursor');
    }

    // Validate UUID format (basic check)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new Error('Invalid UUID in cursor');
    }

    return { created_at, id };
  } catch {
    throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 422, {
      field: 'cursor',
      message: 'Invalid cursor format',
    });
  }
}

/**
 * Fetch attachments for multiple messages in a single query
 */
async function fetchAttachmentsForMessages(
  supabase: SupabaseClient,
  messageIds: string[]
): Promise<Map<string, MessageAttachment[]>> {
  if (messageIds.length === 0) return new Map();

  const { data: attachments, error } = await supabase
    .from('message_attachments')
    .select(
      `
      message_id,
      document_id,
      documents:document_id (
        name,
        mime_type,
        size_bytes
      )
    `
    )
    .in('message_id', messageIds);

  if (error) {
    throw new AppError('Failed to fetch attachments', 500, ErrorCodes.INTERNAL_ERROR, error);
  }

  const attachmentsMap = new Map<string, MessageAttachment[]>();

  if (attachments) {
    for (const att of attachments as any[]) {
      const doc = att.documents;

      if (!attachmentsMap.has(att.message_id)) {
        attachmentsMap.set(att.message_id, []);
      }

      // Skip attachments with missing documents (data integrity issue)
      if (!doc || !doc.name) {
        logger.warn('Attachment references missing document', {
          message_id: att.message_id,
          document_id: att.document_id,
        });
        continue;
      }

      attachmentsMap.get(att.message_id)!.push({
        document_id: att.document_id,
        filename: doc.name,
        mime_type: doc.mime_type || null,
        size_bytes: doc.size_bytes || null,
      });
    }
  }

  return attachmentsMap;
}

/**
 * Fetch attachments for a single message
 * Used for response building in routes
 */
export async function fetchMessageAttachments(
  supabase: SupabaseClient,
  messageId: string
): Promise<MessageAttachment[]> {
  const { data: attachments, error } = await supabase
    .from('message_attachments')
    .select(`
      document_id,
      documents:document_id (
        name,
        mime_type,
        size_bytes
      )
    `)
    .eq('message_id', messageId);

  if (error) {
    throw new AppError('Failed to fetch attachments', 500, ErrorCodes.INTERNAL_ERROR, error);
  }

  if (!attachments) return [];

  return attachments
    .filter((att: any) => att.documents?.name)
    .map((att: any) => ({
      document_id: att.document_id,
      filename: att.documents.name,
      mime_type: att.documents.mime_type || null,
      size_bytes: att.documents.size_bytes || null,
    }));
}

/**
 * Ensure conversation exists for client, create if not exists (concurrency-safe)
 * Returns conversation ID and whether it was newly created
 */
export async function ensureConversationExists(
  supabase: SupabaseClient,
  clientId: string,
  actorUserId: string,
  actorRole: string
): Promise<{ conversationId: string; isNew: boolean }> {
  // Try to select existing conversation
  const { data: existing, error: selectError } = await supabase
    .from('client_conversations')
    .select('id')
    .eq('client_id', clientId)
    .maybeSingle();

  if (selectError) {
    throw new AppError('Failed to check conversation', 500, ErrorCodes.INTERNAL_ERROR, selectError);
  }

  if (existing) {
    return { conversationId: existing.id, isNew: false };
  }

  // Try to insert new conversation
  const { data: inserted, error: insertError } = await supabase
    .from('client_conversations')
    .insert({
      client_id: clientId,
    })
    .select('id')
    .single();

  if (insertError) {
    // Unique violation: another request created it
    if (insertError.code === '23505') {
      const { data: reselected, error: reselectError } = await supabase
        .from('client_conversations')
        .select('id')
        .eq('client_id', clientId)
        .single();

      if (reselectError || !reselected) {
        throw new AppError(
          'Failed to retrieve conversation after conflict',
          500,
          ErrorCodes.INTERNAL_ERROR,
          reselectError
        );
      }

      return { conversationId: reselected.id, isNew: false };
    }

    throw new AppError('Failed to create conversation', 500, ErrorCodes.INTERNAL_ERROR, insertError);
  }

  // Audit: conversation created
  auditLogService.logAsync({
    client_id: clientId,
    actor_user_id: actorUserId,
    actor_role: actorRole,
    action: AuditActions.CONVERSATION_CREATE,
    entity_type: 'conversation',
    entity_id: inserted.id,
  });

  return { conversationId: inserted.id, isNew: true };
}

/**
 * Create a new message in a conversation
 */
export async function createMessage(
  supabase: SupabaseClient,
  clientId: string,
  conversationId: string,
  senderUserId: string,
  senderRole: 'admin' | 'client',
  body: string
): Promise<DbMessage> {
  const { data: message, error: insertError } = await supabase
    .from('messages')
    .insert({
      client_id: clientId,
      conversation_id: conversationId,
      sender_user_id: senderUserId,
      sender_role: senderRole,
      body,
    })
    .select()
    .single();

  if (insertError || !message) {
    throw new AppError('Failed to create message', 500, ErrorCodes.INTERNAL_ERROR, insertError);
  }

  // Update conversation last_message_at (best effort)
  const { error: updateError } = await supabase
    .from('client_conversations')
    .update({ last_message_at: (message as any).created_at })
    .eq('id', conversationId);

  if (updateError) {
    logger.warn('Failed to update conversation last_message_at', { 
      conversationId, 
      error: updateError 
    });
  }

  // Audit log removed - caller will log with correct attachment_count
  return message as DbMessage;
}

/**
 * Validate that all documents belong to the specified client
 * @throws AppError with 403 if any document doesn't belong to client or doesn't exist
 */
export async function validateDocumentOwnership(
  supabase: SupabaseClient,
  clientId: string,
  documentIds: string[]
): Promise<void> {
  if (documentIds.length === 0) return;

  const { data: documents, error } = await supabase
    .from('documents')
    .select('id, client_id')
    .in('id', documentIds)
    .is('deleted_at', null);

  if (error) {
    throw new AppError('Failed to validate documents', 500, ErrorCodes.INTERNAL_ERROR, error);
  }

  if (!documents || documents.length !== documentIds.length) {
    throw AppError.fromCode(ErrorCodes.CLIENT_ACCESS_DENIED, 403, {
      message: 'One or more documents not found or access denied',
    });
  }

  const invalidDocuments = (documents as any[]).filter((doc) => doc.client_id !== clientId);
  if (invalidDocuments.length > 0) {
    throw AppError.fromCode(ErrorCodes.CLIENT_ACCESS_DENIED, 403, {
      message: 'Cross-client document access denied',
      invalid_document_ids: invalidDocuments.map((d) => d.id),
    });
  }
}

/**
 * Update audit log metadata with attachment count
 */
export function updateMessageAuditMetadata(
  clientId: string,
  actorUserId: string,
  actorRole: string,
  messageId: string,
  attachmentCount: number
): void {
  auditLogService.logAsync({
    client_id: clientId,
    actor_user_id: actorUserId,
    actor_role: actorRole,
    action: AuditActions.MESSAGE_CREATE,
    entity_type: 'message',
    entity_id: messageId,
    metadata: { attachment_count: attachmentCount },
  });
}
