// src/modules/messages/messages.routes.ts
import { Router } from 'express';
import { body, query } from 'express-validator';
import { asyncHandler } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import { createSupabaseUserClient, createSupabaseAdminClient } from '../../lib/supabaseClient';
import { 
  fetchMessages, 
  ensureConversationExists, 
  createMessage,
  validateDocumentOwnership,
  linkAttachments,
  updateMessageAuditMetadata,
  fetchMessageAttachments,
} from './messages.service';
import { emailService } from '../../lib/emailService';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

const router = Router();

/**
 * Send email notifications for a new message
 * Client → Admin: send to ADMIN_NOTIFICATION_EMAILS
 * Admin → Client: send to all active client users
 */
async function sendMessageNotifications(
  clientId: string,
  senderUserId: string,
  senderRole: 'admin' | 'client',
  messageBody: string
): Promise<void> {
  const messagePreview = messageBody.length > 140 
    ? messageBody.substring(0, 140) + '...' 
    : messageBody;
  
  const conversationUrl = `${env.frontendUrl}/clients/${clientId}/messages`;

  // Fetch sender name
  const adminSupabase = createSupabaseAdminClient();
  const { data: sender } = await adminSupabase
    .from('app_users')
    .select('full_name, email')
    .eq('id', senderUserId)
    .single();

  const senderName = sender?.full_name || sender?.email || 'Someone';

  let recipients: string[] = [];

  if (senderRole === 'client') {
    // Client → Admin: send to admin notification emails
    recipients = env.notifications.adminNotificationEmails;
  } else {
    // Admin → Client: send to all active client users
    const { data: clientUsers } = await adminSupabase
      .from('app_users')
      .select('email')
      .eq('client_id', clientId)
      .eq('role', 'client')
      .eq('is_active', true);

    recipients = clientUsers?.map(u => u.email) || [];
  }

  if (recipients.length > 0) {
    await emailService.sendMessageNotification({
      to: recipients,
      senderName,
      messagePreview,
      conversationUrl,
    });
  }
}

/**
 * @openapi
 * /api/clients/{clientId}/messages:
 *   get:
 *     summary: List messages for a client conversation
 *     description: Retrieve paginated messages with cursor-based pagination. Returns messages in descending order (newest first).
 *     tags:
 *       - Messages
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Client ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 50
 *         description: Number of messages to return per page
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Cursor for pagination (base64 encoded timestamp and ID)
 *     responses:
 *       200:
 *         description: List of messages with pagination cursor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       sender_user_id:
 *                         type: string
 *                         format: uuid
 *                       sender_role:
 *                         type: string
 *                         enum: [admin, client]
 *                       body:
 *                         type: string
 *                       attachments:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             document_id:
 *                               type: string
 *                               format: uuid
 *                             filename:
 *                               type: string
 *                             mime_type:
 *                               type: string
 *                             size_bytes:
 *                               type: integer
 *                 next_cursor:
 *                   type: string
 *                   nullable: true
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied (tenant isolation)
 *       422:
 *         description: Invalid cursor format
 */
router.get(
  '/',
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 200 })
      .withMessage('Limit must be between 1 and 200')
      .toInt(),
    query('cursor')
      .optional()
      .isString()
      .withMessage('Cursor must be a string'),
    handleValidationErrors,
  ],
  asyncHandler(async (req, res) => {
    const clientId = req.params.clientId;
    const limit = (req.query.limit as number | undefined) || 50;
    const cursor = req.query.cursor as string | undefined;

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      throw new Error('Authorization token missing');
    }

    const supabase = createSupabaseUserClient(token);

    const result = await fetchMessages(supabase, clientId, limit, cursor);

    res.json(result);
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/messages:
 *   post:
 *     summary: Send a message in a client conversation
 *     description: Create a new message. If no conversation exists, it will be created automatically.
 *     tags:
 *       - Messages
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Client ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - body
 *             properties:
 *               body:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 10000
 *                 description: Message content (plain text)
 *               attachment_document_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 maxItems: 20
 *                 description: Optional array of document IDs to attach
 *     responses:
 *       201:
 *         description: Message created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                 sender_user_id:
 *                   type: string
 *                   format: uuid
 *                 sender_role:
 *                   type: string
 *                   enum: [admin, client]
 *                 body:
 *                   type: string
 *                 attachments:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied (tenant isolation or document ownership)
 *       422:
 *         description: Validation error
 */
router.post(
  '/',
  [
    body('body')
      .isString()
      .withMessage('Body must be a string')
      .trim()
      .notEmpty()
      .withMessage('Body is required')
      .isLength({ max: 10000 })
      .withMessage('Body must not exceed 10000 characters'),
    body('attachment_document_ids')
      .optional()
      .isArray({ max: 20 })
      .withMessage('Attachment document IDs must be an array with max 20 items'),
    body('attachment_document_ids.*')
      .optional()
      .isUUID()
      .withMessage('Each attachment document ID must be a valid UUID'),
    handleValidationErrors,
  ],
  asyncHandler(async (req, res) => {
    const clientId = req.params.clientId;
    const { body: messageBody, attachment_document_ids } = req.body;

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      throw new Error('Authorization token missing');
    }

    const supabase = createSupabaseUserClient(token);

    // Ensure user is authenticated
    if (!req.user?.sub || !req.user?.role) {
      throw new Error('User authentication required');
    }

    // Step 1: Ensure conversation exists (create-on-first-message)
    const { conversationId } = await ensureConversationExists(
      supabase,
      clientId,
      req.user.sub,
      req.user.role
    );

    // Step 2: Validate document ownership if attachments provided
    if (attachment_document_ids && attachment_document_ids.length > 0) {
      await validateDocumentOwnership(supabase, clientId, attachment_document_ids);
    }

    // Step 3: Create message
    const message = await createMessage(
      supabase,
      clientId,
      conversationId,
      req.user.sub,
      req.user.role as 'admin' | 'client',
      messageBody
    );

    // Step 4: Link attachments if provided
    const attachmentCount = attachment_document_ids?.length || 0;
    if (attachmentCount > 0) {
      await linkAttachments(supabase, message.id, clientId, attachment_document_ids);
    }

    // Step 4.5: Log message creation with correct attachment count
    updateMessageAuditMetadata(
      clientId,
      req.user.sub,
      req.user.role,
      message.id,
      attachmentCount
    );

    // Step 5: Send email notifications (async, don't block response)
    sendMessageNotifications(clientId, req.user.sub, req.user.role as 'admin' | 'client', messageBody)
      .catch(error => {
        logger.error('Failed to send message notifications', { 
          error: error instanceof Error ? error.message : String(error),
          clientId,
          senderUserId: req.user?.sub,
        });
      });

    // Step 6: Fetch attachments for response (direct query, no race condition)
    const attachments = attachmentCount > 0 
      ? await fetchMessageAttachments(supabase, message.id)
      : [];

    res.status(201).json({
      ...message,
      attachments,
    });
  })
);

export default router;
