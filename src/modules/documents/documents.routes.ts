// src/modules/documents/documents.routes.ts
import { Router, Request, Response } from 'express';
import { param, query, header } from 'express-validator';
import multer from 'multer';
import crypto from 'crypto';
import { createSupabaseUserClient, createSupabaseAdminClient } from '../../lib/supabaseClient';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import { auditLogService } from '../../services/auditLogService';
import { AuditActions } from '../../constants/auditActions';
import { ErrorCodes } from '../../constants/errorCodes';
import { env } from '../../config/env';
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
 *     description: Retrieve documents for a specific client with optional filters
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
 *                     count:
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
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    const supabase = createSupabaseUserClient(token);

    const { source, kind } = req.query;

    let query = supabase.from('documents').select('*').eq('client_id', clientId);

    if (source && typeof source === 'string') {
      query = query.eq('source', source);
    }

    if (kind && typeof kind === 'string') {
      query = query.eq('kind', kind);
    }

    const { data, error } = await query.order('created_at', {
      ascending: false,
    });

    if (error) {
      throw new AppError(`Failed to fetch documents: ${error.message}`, 500);
    }

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
        },
        result_count: data?.length ?? 0,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    res.json({
      data,
      meta: {
        count: data?.length ?? 0,
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

    // Step 5: Audit log (non-blocking)
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
