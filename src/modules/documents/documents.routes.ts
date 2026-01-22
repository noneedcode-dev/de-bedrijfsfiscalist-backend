// src/modules/documents/documents.routes.ts
import { Router, Request, Response } from 'express';
import { param, query, header, body } from 'express-validator';
import multer from 'multer';
import crypto from 'crypto';
import { createSupabaseUserClient, createSupabaseAdminClient } from '../../lib/supabaseClient';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import { auditLogService } from '../../services/auditLogService';
import { AuditActions } from '../../constants/auditActions';
import { ErrorCodes } from '../../constants/errorCodes';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { DbDocument } from '../../types/database';

export const documentsRouter = Router({ mergeParams: true });

// Configure multer for memory storage (we'll stream to Supabase)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.documents.maxSizeMB * 1024 * 1024, // Convert MB to bytes
  },
});

/**
 * @openapi
 * /api/clients/{clientId}/documents:
 *   get:
 *     summary: Get documents
 *     description: Retrieve documents for a specific client with optional filters, pagination, and search
 *     tags:
 *       - Documents
 *     security:
 *       - ApiKeyAuth: []
 *         BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Client ID
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *         description: Filter by document source
 *       - in: query
 *         name: kind
 *         schema:
 *           type: string
 *         description: Filter by document kind/type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of documents to return (default 20, max 100)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of documents to skip (default 0)
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *           maxLength: 200
 *         description: Search query for document filename
 *     responses:
 *       200:
 *         description: List of documents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Document'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     limit:
 *                       type: number
 *                     offset:
 *                       type: number
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
documentsRouter.get(
  '/',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    query('source').optional().isString().withMessage('Invalid source format'),
    query('kind').optional().isString().withMessage('Invalid kind format'),
    query('folder_id').optional().isUUID().withMessage('Invalid folder_id format'),
    query('tag_id').optional().isUUID().withMessage('Invalid tag_id format'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be an integer between 1 and 100')
      .toInt(),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
      .toInt(),
    query('q')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Search query must be a string with max length 200'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;

    // Parse pagination params with defaults
    const limit = typeof req.query.limit === 'number' ? req.query.limit : 20;
    const offset = typeof req.query.offset === 'number' ? req.query.offset : 0;
    const searchQuery = typeof req.query.q === 'string' ? req.query.q : undefined;
    const { source, kind, folder_id, tag_id } = req.query;

    // Use admin client to avoid RLS issues in production
    const adminSupabase = createSupabaseAdminClient();

    // If filtering by tag_id, we need to join with document_tag_links
    if (tag_id && typeof tag_id === 'string') {
      // Get document IDs that have this tag
      const { data: tagLinks, error: tagError } = await adminSupabase
        .from('document_tag_links')
        .select('document_id')
        .eq('tag_id', tag_id);

      if (tagError) {
        throw new AppError(`Failed to fetch tag links: ${tagError.message}`, 500);
      }

      const documentIds = tagLinks?.map((link) => link.document_id) || [];

      if (documentIds.length === 0) {
        // No documents with this tag
        return res.json({
          data: [],
          meta: {
            total: 0,
            limit,
            offset,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Build query with tag filter
      let query = adminSupabase
        .from('documents')
        .select('*', { count: 'exact' })
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .in('id', documentIds);

      if (source && typeof source === 'string') {
        query = query.eq('source', source);
      }

      if (kind && typeof kind === 'string') {
        query = query.eq('kind', kind);
      }

      if (folder_id && typeof folder_id === 'string') {
        query = query.eq('folder_id', folder_id);
      }

      if (searchQuery) {
        query = query.ilike('name', `%${searchQuery}%`);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new AppError(`Failed to fetch documents: ${error.message}`, 500);
      }

      const total = count ?? 0;

      auditLogService.logAsync({
        client_id: clientId,
        actor_user_id: req.user?.sub,
        actor_role: req.user?.role,
        action: AuditActions.DOCUMENTS_LIST_VIEWED,
        entity_type: 'document',
        metadata: {
          query_params: {
            source: source || null,
            kind: kind || null,
            folder_id: folder_id || null,
            tag_id: tag_id || null,
            limit,
            offset,
            q: searchQuery || null,
          },
          result_count: data?.length ?? 0,
          total_count: total,
          ip: req.ip,
          user_agent: req.headers['user-agent'],
        },
      });

      return res.json({
        data,
        meta: {
          total,
          limit,
          offset,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Build query with count (no tag filter)
    let query = adminSupabase
      .from('documents')
      .select('*', { count: 'exact' })
      .eq('client_id', clientId)
      .is('deleted_at', null);

    if (source && typeof source === 'string') {
      query = query.eq('source', source);
    }

    if (kind && typeof kind === 'string') {
      query = query.eq('kind', kind);
    }

    if (folder_id && typeof folder_id === 'string') {
      query = query.eq('folder_id', folder_id);
    }

    // Apply search filter on filename (name field)
    if (searchQuery) {
      query = query.ilike('name', `%${searchQuery}%`);
    }

    // Apply ordering, pagination
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new AppError(`Failed to fetch documents: ${error.message}`, 500);
    }

    const total = count ?? 0;

    // Audit log (non-blocking)
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.DOCUMENTS_LIST_VIEWED,
      entity_type: 'document',
      metadata: {
        query_params: {
          source: source || null,
          kind: kind || null,
          folder_id: folder_id || null,
          tag_id: tag_id || null,
          limit,
          offset,
          q: searchQuery || null,
        },
        result_count: data?.length ?? 0,
        total_count: total,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    return res.json({
      data,
      meta: {
        total,
        limit,
        offset,
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/documents/{id}/download:
 *   get:
 *     summary: Get document download URL
 *     description: Generate a signed URL for downloading a document
 *     tags:
 *       - Documents
 *     security:
 *       - ApiKeyAuth: []
 *         BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Client ID
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Document ID
 *     responses:
 *       200:
 *         description: Signed download URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: Signed URL for downloading the document
 *                 expires_in:
 *                   type: number
 *                   description: TTL in seconds
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
documentsRouter.get(
  '/:id/download',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('id').isUUID().withMessage('Invalid id format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const documentId = req.params.id;

    const adminSupabase = createSupabaseAdminClient();

    // Fetch document by id and client_id (use admin client to avoid RLS issues)
    const { data: document, error: fetchError } = await adminSupabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(`Failed to fetch document: ${fetchError.message}`, 500);
    }

    // Return 404 if document not found (also for cross-client access to avoid leaking)
    if (!document) {
      throw AppError.fromCode(ErrorCodes.NOT_FOUND, 404, {
        message: 'Document not found',
      });
    }

    // Generate signed URL from Supabase Storage
    const ttlSeconds = env.documents.signedUrlTtlSeconds;
    const { data: signedUrlData, error: signedUrlError } = await adminSupabase.storage
      .from('documents')
      .createSignedUrl(document.storage_path, ttlSeconds);

    if (signedUrlError || !signedUrlData) {
      throw new AppError(
        `Failed to generate signed URL: ${signedUrlError?.message || 'Unknown error'}`,
        500
      );
    }

    // Audit log (non-blocking)
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.DOCUMENT_DOWNLOAD_URL_CREATED,
      entity_type: 'document',
      entity_id: documentId,
      metadata: {
        document_name: document.name,
        storage_path: document.storage_path,
        ttl_seconds: ttlSeconds,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    res.json({
      url: signedUrlData.signedUrl,
      expires_in: ttlSeconds,
    });
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/documents/{id}/preview:
 *   get:
 *     summary: Get document preview URL
 *     description: Generate a signed URL for downloading a document preview thumbnail
 *     tags:
 *       - Documents
 *     security:
 *       - ApiKeyAuth: []
 *         BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Client ID
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Document ID
 *     responses:
 *       200:
 *         description: Signed preview URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: Signed URL for downloading the preview
 *                 expires_in:
 *                   type: number
 *                   description: TTL in seconds
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
documentsRouter.get(
  '/:id/preview',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('id').isUUID().withMessage('Invalid id format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const documentId = req.params.id;

    const adminSupabase = createSupabaseAdminClient();

    const { data: document, error: fetchError } = await adminSupabase
      .from('documents')
      .select('id, client_id, preview_status, preview_storage_key')
      .eq('id', documentId)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(`Failed to fetch document: ${fetchError.message}`, 500);
    }

    if (!document) {
      throw AppError.fromCode(ErrorCodes.NOT_FOUND, 404, {
        message: 'Document not found',
      });
    }

    if (document.preview_status !== 'ready' || !document.preview_storage_key) {
      throw AppError.fromCode(ErrorCodes.NOT_FOUND, 404, {
        message: 'Preview not available',
      });
    }

    const ttlSeconds = env.documents.previewSignedUrlTtlSeconds;
    const { data: signedUrlData, error: signedUrlError } = await adminSupabase.storage
      .from('documents')
      .createSignedUrl(document.preview_storage_key, ttlSeconds);

    if (signedUrlError || !signedUrlData) {
      throw new AppError(
        `Failed to generate signed URL: ${signedUrlError?.message || 'Unknown error'}`,
        500
      );
    }

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.DOCUMENT_PREVIEW_URL_CREATED,
      entity_type: 'document',
      entity_id: documentId,
      metadata: {
        preview_storage_key: document.preview_storage_key,
        ttl_seconds: ttlSeconds,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    res.json({
      url: signedUrlData.signedUrl,
      expires_in: ttlSeconds,
    });
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/documents/upload:
 *   post:
 *     summary: Upload a document
 *     description: Upload a document with idempotency support via Idempotency-Key header
 *     tags:
 *       - Documents
 *     security:
 *       - ApiKeyAuth: []
 *         BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Client ID
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique key for idempotent upload (used as upload_session_id)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File to upload
 *     responses:
 *       200:
 *         description: Document already exists (idempotent response)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Document'
 *                 message:
 *                   type: string
 *                   example: Document already uploaded
 *       201:
 *         description: Document uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Document'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       413:
 *         description: File too large
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
documentsRouter.post(
  '/upload',
  upload.single('file'),
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    header('idempotency-key').notEmpty().withMessage('Idempotency-Key header is required'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const uploadSessionId = req.headers['idempotency-key'] as string;

    // Check if file was provided
    if (!req.file) {
      throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 422, {
        message: 'File is required',
        errors: [{ field: 'file', message: 'No file uploaded' }],
      });
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    const supabase = createSupabaseUserClient(token);
    const adminSupabase = createSupabaseAdminClient();

    // Step 1: Check if document already exists (idempotency)
    const { data: existingDoc, error: checkError } = await supabase
      .from('documents')
      .select('*')
      .eq('client_id', clientId)
      .eq('upload_session_id', uploadSessionId)
      .maybeSingle();

    if (checkError) {
      throw new AppError(`Failed to check existing document: ${checkError.message}`, 500);
    }

    if (existingDoc) {
      // Idempotent response - return existing document
      return res.status(200).json({
        data: existingDoc,
        message: 'Document already uploaded',
      });
    }

    // Step 2: Generate document ID and prepare metadata
    const docId = crypto.randomUUID();
    const originalFilename = req.file.originalname;
    const mimeType = req.file.mimetype;
    const size = req.file.size;
    const createdBy = req.user?.sub;

    // Create safe filename (remove special chars, preserve extension)
    const safeFilename = originalFilename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .substring(0, 255); // Limit length

    // Storage key format: clients/{clientId}/documents/{docId}/{safe_filename}
    const storageKey = `clients/${clientId}/documents/${docId}/${safeFilename}`;

    // Step 3: Insert DB row first (use admin client to bypass RLS)
    const newDocument: Partial<DbDocument> = {
      id: docId,
      client_id: clientId,
      uploaded_by: createdBy || null,
      source: 's3', // Using Supabase Storage (S3-compatible)
      kind: 'client_upload',
      name: originalFilename,
      mime_type: mimeType,
      size_bytes: size,
      storage_path: storageKey,
      upload_session_id: uploadSessionId,
    };

    const { data: insertedDoc, error: insertError } = await adminSupabase
      .from('documents')
      .insert(newDocument)
      .select()
      .single();

    if (insertError) {
      throw new AppError(`Failed to create document record: ${insertError.message}`, 500);
    }

    // Step 4: Upload file to Supabase Storage
    // Use admin client for storage to bypass RLS
    const { error: uploadError } = await adminSupabase.storage
      .from('documents')
      .upload(storageKey, req.file.buffer, {
        contentType: mimeType,
        upsert: false, // Don't overwrite if exists
      });

    if (uploadError) {
      // Best-effort cleanup: delete DB row (use admin client)
      await adminSupabase
        .from('documents')
        .delete()
        .eq('id', docId);

      throw new AppError(`Failed to upload file to storage: ${uploadError.message}`, 500);
    }

    // Step 5: Enqueue preview generation job (non-blocking)
    try {
      const { error: enqueueError } = await adminSupabase.rpc('enqueue_document_preview_job', {
        p_client_id: clientId,
        p_document_id: docId,
      });

      if (enqueueError) {
        logger.warn('Failed to enqueue preview job', { 
          documentId: docId, 
          error: enqueueError 
        });
      } else {
        await adminSupabase
          .from('documents')
          .update({ preview_status: 'pending' })
          .eq('id', docId);

        auditLogService.logAsync({
          client_id: clientId,
          actor_user_id: createdBy,
          actor_role: req.user?.role,
          action: AuditActions.DOCUMENT_PREVIEW_JOB_ENQUEUED,
          entity_type: 'document',
          entity_id: docId,
          metadata: {
            mime_type: mimeType,
          },
        });
      }
    } catch (error) {
      logger.warn('Exception while enqueuing preview job', { 
        documentId: docId, 
        error 
      });
    }

    // Step 6: Audit log (non-blocking)
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: createdBy,
      actor_role: req.user?.role,
      action: AuditActions.DOCUMENT_UPLOADED,
      entity_type: 'document',
      entity_id: docId,
      metadata: {
        original_filename: originalFilename,
        mime_type: mimeType,
        size_bytes: size,
        upload_session_id: uploadSessionId,
        storage_key: storageKey,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    // Return success
    return res.status(201).json({
      data: insertedDoc,
    });
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/documents/{id}:
 *   patch:
 *     summary: Update document folder and tags
 *     description: Update folder_id and/or tags for a document
 *     tags:
 *       - Documents
 *     security:
 *       - ApiKeyAuth: []
 *         BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Client ID
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Document ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               folder_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: Folder ID (null to remove from folder)
 *               tag_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Array of tag IDs to assign
 *     responses:
 *       200:
 *         description: Document updated successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
documentsRouter.patch(
  '/:id',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('id').isUUID().withMessage('Invalid id format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const documentId = req.params.id;
    const { folder_id, tag_ids } = req.body;
    const userId = req.user?.sub;
    const adminSupabase = createSupabaseAdminClient();

    // Verify document exists and belongs to client
    const { data: document, error: fetchError } = await adminSupabase
      .from('documents')
      .select('id, client_id, folder_id')
      .eq('id', documentId)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(`Failed to fetch document: ${fetchError.message}`, 500);
    }

    if (!document) {
      throw AppError.fromCode(ErrorCodes.NOT_FOUND, 404, {
        message: 'Document not found',
      });
    }

    // Update folder_id if provided
    if (folder_id !== undefined) {
      // Verify folder exists and belongs to client (if not null)
      if (folder_id !== null) {
        const { data: folder, error: folderError } = await adminSupabase
          .from('document_folders')
          .select('id')
          .eq('id', folder_id)
          .eq('client_id', clientId)
          .maybeSingle();

        if (folderError) {
          throw new AppError(`Failed to verify folder: ${folderError.message}`, 500);
        }

        if (!folder) {
          throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 422, {
            message: 'Folder not found',
          });
        }
      }

      const { error: updateError } = await adminSupabase
        .from('documents')
        .update({ folder_id })
        .eq('id', documentId);

      if (updateError) {
        throw new AppError(`Failed to update document folder: ${updateError.message}`, 500);
      }

      auditLogService.logAsync({
        client_id: clientId,
        actor_user_id: userId,
        actor_role: req.user?.role,
        action: AuditActions.DOCUMENT_FOLDER_CHANGED,
        entity_type: 'document',
        entity_id: documentId,
        metadata: {
          old_folder_id: document.folder_id,
          new_folder_id: folder_id,
          ip: req.ip,
          user_agent: req.headers['user-agent'],
        },
      });
    }

    // Update tags if provided
    if (tag_ids !== undefined && Array.isArray(tag_ids)) {
      // Verify all tags exist and belong to client
      if (tag_ids.length > 0) {
        const { data: tags, error: tagsError } = await adminSupabase
          .from('document_tags')
          .select('id')
          .eq('client_id', clientId)
          .in('id', tag_ids);

        if (tagsError) {
          throw new AppError(`Failed to verify tags: ${tagsError.message}`, 500);
        }

        if (!tags || tags.length !== tag_ids.length) {
          throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 422, {
            message: 'One or more tags not found',
          });
        }
      }

      // Delete existing tag links
      const { error: deleteError } = await adminSupabase
        .from('document_tag_links')
        .delete()
        .eq('document_id', documentId);

      if (deleteError) {
        throw new AppError(`Failed to remove existing tags: ${deleteError.message}`, 500);
      }

      // Insert new tag links
      if (tag_ids.length > 0) {
        const tagLinks = tag_ids.map((tag_id) => ({
          document_id: documentId,
          tag_id,
        }));

        const { error: insertError } = await adminSupabase
          .from('document_tag_links')
          .insert(tagLinks);

        if (insertError) {
          throw new AppError(`Failed to assign tags: ${insertError.message}`, 500);
        }
      }

      auditLogService.logAsync({
        client_id: clientId,
        actor_user_id: userId,
        actor_role: req.user?.role,
        action: AuditActions.DOCUMENT_TAGS_CHANGED,
        entity_type: 'document',
        entity_id: documentId,
        metadata: {
          tag_ids,
          ip: req.ip,
          user_agent: req.headers['user-agent'],
        },
      });
    }

    res.json({ success: true });
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/documents/{id}:
 *   delete:
 *     summary: Soft-delete (archive) a document
 *     description: Marks a document as deleted without removing it from storage
 *     tags:
 *       - Documents
 *     security:
 *       - ApiKeyAuth: []
 *         BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Client ID
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Document ID
 *     responses:
 *       204:
 *         description: Document archived successfully (idempotent)
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
documentsRouter.delete(
  '/:id',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('id').isUUID().withMessage('Invalid id format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const documentId = req.params.id;
    const userId = req.user?.sub;

    const adminSupabase = createSupabaseAdminClient();

    // Fetch document to verify it exists and belongs to this client
    const { data: document, error: fetchError } = await adminSupabase
      .from('documents')
      .select('id, client_id, name, storage_path, deleted_at')
      .eq('id', documentId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(`Failed to fetch document: ${fetchError.message}`, 500);
    }

    // Return 404 if document not found for this client
    if (!document) {
      throw AppError.fromCode(ErrorCodes.NOT_FOUND, 404, {
        message: 'Document not found',
      });
    }

    // If already deleted, return 204 (idempotent)
    if (document.deleted_at) {
      return res.status(204).send();
    }

    // Soft-delete: set deleted_at and deleted_by
    const { error: updateError } = await adminSupabase
      .from('documents')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: userId || null,
      })
      .eq('id', documentId);

    if (updateError) {
      throw new AppError(`Failed to archive document: ${updateError.message}`, 500);
    }

    // Audit log (non-blocking)
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: userId,
      actor_role: req.user?.role,
      action: AuditActions.DOCUMENT_ARCHIVED,
      entity_type: 'document',
      entity_id: documentId,
      metadata: {
        document_name: document.name,
        storage_path: document.storage_path,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    return res.status(204).send();
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/documents/{id}/purge:
 *   post:
 *     summary: Permanently delete a document (admin only)
 *     description: Removes document from database and deletes associated storage objects
 *     tags:
 *       - Documents
 *     security:
 *       - ApiKeyAuth: []
 *         BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Client ID
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Document ID
 *     responses:
 *       204:
 *         description: Document purged successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
documentsRouter.post(
  '/:id/purge',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('id').isUUID().withMessage('Invalid id format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const documentId = req.params.id;
    const userId = req.user?.sub;

    // Admin-only check
    if (req.user?.role !== 'admin') {
      throw AppError.fromCode(ErrorCodes.AUTH_INSUFFICIENT_PERMISSIONS, 403, {
        message: 'Only admins can purge documents',
      });
    }

    const adminSupabase = createSupabaseAdminClient();

    // Fetch document to get storage paths
    const { data: document, error: fetchError } = await adminSupabase
      .from('documents')
      .select('id, client_id, name, storage_path, preview_url')
      .eq('id', documentId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(`Failed to fetch document: ${fetchError.message}`, 500);
    }

    // Return 404 if document not found
    if (!document) {
      throw AppError.fromCode(ErrorCodes.NOT_FOUND, 404, {
        message: 'Document not found',
      });
    }

    // Step 1: Delete storage objects first (best-effort to avoid orphaned DB rows)
    const storageErrors: string[] = [];

    // Delete original file
    if (document.storage_path) {
      const { error: storageError } = await adminSupabase.storage
        .from('documents')
        .remove([document.storage_path]);

      if (storageError) {
        storageErrors.push(`Failed to delete storage file: ${storageError.message}`);
      }
    }

    // Delete preview if exists (from PR-8, optional field)
    if (document.preview_url) {
      // Extract storage key from preview_url if it's a storage path
      // This is a placeholder for PR-8 integration
      // For now, we'll skip preview deletion if preview_url is just a URL
    }

    // Step 2: Delete DB row
    const { error: deleteError } = await adminSupabase
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (deleteError) {
      // If DB delete fails but storage was deleted, we have inconsistency
      // Return 500 with details
      throw new AppError(
        `Failed to delete document from database: ${deleteError.message}. Storage errors: ${storageErrors.join(', ')}`,
        500
      );
    }

    // If storage deletion failed but DB succeeded, log warning but return success
    if (storageErrors.length > 0) {
      logger.warn('Document purged but storage cleanup had errors', {
        documentId,
        clientId,
        storageErrors,
      });
    }

    // Audit log (non-blocking)
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: userId,
      actor_role: req.user?.role,
      action: AuditActions.DOCUMENT_PURGED,
      entity_type: 'document',
      entity_id: documentId,
      metadata: {
        document_name: document.name,
        storage_path: document.storage_path,
        storage_errors: storageErrors.length > 0 ? storageErrors : undefined,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    return res.status(204).send();
  })
);

// ============================================================================
// DOCUMENT EXPORT ENDPOINTS
// ============================================================================

/**
 * POST /api/clients/:clientId/documents/export
 * Create a document export job for multiple documents
 */
documentsRouter.post(
  '/export',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    body('document_ids')
      .isArray({ min: 1, max: 50 })
      .withMessage('document_ids must be an array with 1-50 items'),
    body('document_ids.*')
      .isUUID()
      .withMessage('Each document_id must be a valid UUID'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const { document_ids } = req.body;
    const userId = req.user?.sub;

    const adminSupabase = createSupabaseAdminClient();

    // Verify all documents exist and belong to this client
    const { data: documents, error: docError } = await adminSupabase
      .from('documents')
      .select('id, size_bytes')
      .eq('client_id', clientId)
      .in('id', document_ids)
      .is('deleted_at', null);

    if (docError) {
      throw new AppError(`Failed to verify documents: ${docError.message}`, 500);
    }

    if (!documents || documents.length === 0) {
      throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 422, {
        message: 'No valid documents found',
      });
    }

    if (documents.length !== document_ids.length) {
      throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 422, {
        message: 'Some documents not found or do not belong to this client',
      });
    }

    // Optional: Check total size cap (e.g., 500MB)
    const totalSize = documents.reduce((sum, doc) => sum + (doc.size_bytes || 0), 0);
    const maxSizeBytes = 500 * 1024 * 1024; // 500MB
    if (totalSize > maxSizeBytes) {
      throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 422, {
        message: `Total size exceeds limit of 500MB (requested: ${Math.round(totalSize / 1024 / 1024)}MB)`,
      });
    }

    // Create export record
    const { data: exportRecord, error: insertError } = await adminSupabase
      .from('document_exports')
      .insert({
        client_id: clientId,
        created_by: userId || null,
        status: 'pending',
        document_ids: document_ids,
      })
      .select()
      .single();

    if (insertError) {
      throw new AppError(`Failed to create export: ${insertError.message}`, 500);
    }

    // Audit log
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: userId,
      actor_role: req.user?.role,
      action: AuditActions.DOCUMENT_EXPORT_CREATED,
      entity_type: 'document_export',
      entity_id: exportRecord.id,
      metadata: {
        document_count: document_ids.length,
        total_size_bytes: totalSize,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    res.status(202).json({
      export_id: exportRecord.id,
      status: exportRecord.status,
    });
  })
);

/**
 * GET /api/clients/:clientId/documents/export/:exportId
 * Get export status and download URL if ready
 */
documentsRouter.get(
  '/export/:exportId',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('exportId').isUUID().withMessage('Invalid exportId format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const exportId = req.params.exportId;
    const userId = req.user?.sub;

    const adminSupabase = createSupabaseAdminClient();

    // Fetch export record
    const { data: exportRecord, error: fetchError } = await adminSupabase
      .from('document_exports')
      .select('*')
      .eq('id', exportId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(`Failed to fetch export: ${fetchError.message}`, 500);
    }

    if (!exportRecord) {
      throw AppError.fromCode(ErrorCodes.NOT_FOUND, 404, {
        message: 'Export not found',
      });
    }

    // Build response based on status
    const response: any = {
      export_id: exportRecord.id,
      status: exportRecord.status,
    };

    if (exportRecord.status === 'ready' && exportRecord.storage_key) {
      // Generate signed URL
      const ttlSeconds = env.documents.signedUrlTtlSeconds;
      const { data: signedUrlData, error: signedUrlError } = await adminSupabase.storage
        .from('documents')
        .createSignedUrl(exportRecord.storage_key, ttlSeconds);

      if (signedUrlError || !signedUrlData) {
        throw new AppError(
          `Failed to generate signed URL: ${signedUrlError?.message || 'Unknown error'}`,
          500
        );
      }

      response.url = signedUrlData.signedUrl;
      response.expires_in = ttlSeconds;

      // Audit log for URL creation
      auditLogService.logAsync({
        client_id: clientId,
        actor_user_id: userId,
        actor_role: req.user?.role,
        action: AuditActions.DOCUMENT_EXPORT_URL_CREATED,
        entity_type: 'document_export',
        entity_id: exportId,
        metadata: {
          storage_key: exportRecord.storage_key,
          ttl_seconds: ttlSeconds,
          ip: req.ip,
          user_agent: req.headers['user-agent'],
        },
      });
    } else if (exportRecord.status === 'failed' && exportRecord.error) {
      response.error = exportRecord.error;
    }

    res.json(response);
  })
);

// ============================================================================
// DOCUMENT FOLDERS ENDPOINTS
// ============================================================================

/**
 * GET /api/clients/:clientId/document-folders
 * List all folders for a client
 */
documentsRouter.get(
  '/document-folders',
  [param('clientId').isUUID().withMessage('Invalid clientId format')],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const adminSupabase = createSupabaseAdminClient();

    const { data, error } = await adminSupabase
      .from('document_folders')
      .select('*')
      .eq('client_id', clientId)
      .order('name', { ascending: true });

    if (error) {
      throw new AppError(`Failed to fetch folders: ${error.message}`, 500);
    }

    res.json({ data });
  })
);

/**
 * POST /api/clients/:clientId/document-folders
 * Create a new folder
 */
documentsRouter.post(
  '/document-folders',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const { name } = req.body;
    const userId = req.user?.sub;
    const adminSupabase = createSupabaseAdminClient();

    const { data, error } = await adminSupabase
      .from('document_folders')
      .insert({
        client_id: clientId,
        name,
        created_by: userId || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 422, {
          message: 'A folder with this name already exists',
        });
      }
      throw new AppError(`Failed to create folder: ${error.message}`, 500);
    }

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: userId,
      actor_role: req.user?.role,
      action: AuditActions.FOLDER_CREATED,
      entity_type: 'document_folder',
      entity_id: data.id,
      metadata: {
        folder_name: name,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    res.status(201).json({ data });
  })
);

/**
 * PATCH /api/clients/:clientId/document-folders/:id
 * Rename a folder
 */
documentsRouter.patch(
  '/document-folders/:id',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('id').isUUID().withMessage('Invalid folder id format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const folderId = req.params.id;
    const { name } = req.body;
    const userId = req.user?.sub;
    const adminSupabase = createSupabaseAdminClient();

    const { data: existingFolder, error: fetchError } = await adminSupabase
      .from('document_folders')
      .select('*')
      .eq('id', folderId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(`Failed to fetch folder: ${fetchError.message}`, 500);
    }

    if (!existingFolder) {
      throw AppError.fromCode(ErrorCodes.NOT_FOUND, 404, {
        message: 'Folder not found',
      });
    }

    const { data, error } = await adminSupabase
      .from('document_folders')
      .update({ name })
      .eq('id', folderId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 422, {
          message: 'A folder with this name already exists',
        });
      }
      throw new AppError(`Failed to update folder: ${error.message}`, 500);
    }

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: userId,
      actor_role: req.user?.role,
      action: AuditActions.FOLDER_RENAMED,
      entity_type: 'document_folder',
      entity_id: folderId,
      metadata: {
        old_name: existingFolder.name,
        new_name: name,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    res.json({ data });
  })
);

/**
 * DELETE /api/clients/:clientId/document-folders/:id
 * Delete a folder (409 if it has documents)
 */
documentsRouter.delete(
  '/document-folders/:id',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('id').isUUID().withMessage('Invalid folder id format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const folderId = req.params.id;
    const userId = req.user?.sub;
    const adminSupabase = createSupabaseAdminClient();

    const { data: folder, error: fetchError } = await adminSupabase
      .from('document_folders')
      .select('*')
      .eq('id', folderId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(`Failed to fetch folder: ${fetchError.message}`, 500);
    }

    if (!folder) {
      throw AppError.fromCode(ErrorCodes.NOT_FOUND, 404, {
        message: 'Folder not found',
      });
    }

    const { count, error: countError } = await adminSupabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('folder_id', folderId)
      .is('deleted_at', null);

    if (countError) {
      throw new AppError(`Failed to check folder contents: ${countError.message}`, 500);
    }

    if (count && count > 0) {
      throw new AppError('Cannot delete folder that contains documents', 409);
    }

    const { error: deleteError } = await adminSupabase
      .from('document_folders')
      .delete()
      .eq('id', folderId);

    if (deleteError) {
      throw new AppError(`Failed to delete folder: ${deleteError.message}`, 500);
    }

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: userId,
      actor_role: req.user?.role,
      action: AuditActions.FOLDER_DELETED,
      entity_type: 'document_folder',
      entity_id: folderId,
      metadata: {
        folder_name: folder.name,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    res.status(204).send();
  })
);

// ============================================================================
// DOCUMENT TAGS ENDPOINTS
// ============================================================================

/**
 * GET /api/clients/:clientId/document-tags
 * List all tags for a client
 */
documentsRouter.get(
  '/document-tags',
  [param('clientId').isUUID().withMessage('Invalid clientId format')],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const adminSupabase = createSupabaseAdminClient();

    const { data, error } = await adminSupabase
      .from('document_tags')
      .select('*')
      .eq('client_id', clientId)
      .order('name', { ascending: true });

    if (error) {
      throw new AppError(`Failed to fetch tags: ${error.message}`, 500);
    }

    res.json({ data });
  })
);

/**
 * POST /api/clients/:clientId/document-tags
 * Create a new tag
 */
documentsRouter.post(
  '/document-tags',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const { name } = req.body;
    const userId = req.user?.sub;
    const adminSupabase = createSupabaseAdminClient();

    const { data, error } = await adminSupabase
      .from('document_tags')
      .insert({
        client_id: clientId,
        name,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 422, {
          message: 'A tag with this name already exists',
        });
      }
      throw new AppError(`Failed to create tag: ${error.message}`, 500);
    }

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: userId,
      actor_role: req.user?.role,
      action: AuditActions.TAG_CREATED,
      entity_type: 'document_tag',
      entity_id: data.id,
      metadata: {
        tag_name: name,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    res.status(201).json({ data });
  })
);

/**
 * DELETE /api/clients/:clientId/document-tags/:id
 * Delete a tag (cascade removes all links)
 */
documentsRouter.delete(
  '/document-tags/:id',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('id').isUUID().withMessage('Invalid tag id format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const tagId = req.params.id;
    const userId = req.user?.sub;
    const adminSupabase = createSupabaseAdminClient();

    const { data: tag, error: fetchError } = await adminSupabase
      .from('document_tags')
      .select('*')
      .eq('id', tagId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(`Failed to fetch tag: ${fetchError.message}`, 500);
    }

    if (!tag) {
      throw AppError.fromCode(ErrorCodes.NOT_FOUND, 404, {
        message: 'Tag not found',
      });
    }

    const { error: deleteError } = await adminSupabase
      .from('document_tags')
      .delete()
      .eq('id', tagId);

    if (deleteError) {
      throw new AppError(`Failed to delete tag: ${deleteError.message}`, 500);
    }

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: userId,
      actor_role: req.user?.role,
      action: AuditActions.TAG_DELETED,
      entity_type: 'document_tag',
      entity_id: tagId,
      metadata: {
        tag_name: tag.name,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    res.status(204).send();
  })
);
