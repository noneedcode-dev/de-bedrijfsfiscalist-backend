import { Router, Request, Response } from 'express';
import { param, body, query } from 'express-validator';
import { createSupabaseAdminClient } from '../../lib/supabaseClient';
import { asyncHandler } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import { auditLogService } from '../../services/auditLogService';
import { AuditActions } from '../../constants/auditActions';
import * as invoicesService from './invoices.service';

export const invoicesRouter = Router({ mergeParams: true });

/**
 * GET /api/clients/:clientId/invoices
 * List invoices for a client (client-scoped)
 */
invoicesRouter.get(
  '/',
  [
    param('clientId').isUUID().withMessage('clientId must be a valid UUID'),
    query('status')
      .optional()
      .isIn(['OPEN', 'REVIEW', 'PAID', 'CANCELLED'])
      .withMessage('status must be OPEN, REVIEW, PAID, or CANCELLED'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('limit must be between 1 and 100')
      .toInt(),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('offset must be a non-negative integer')
      .toInt(),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params;
    const status = req.query.status as 'OPEN' | 'REVIEW' | 'PAID' | 'CANCELLED' | undefined;
    const limit = typeof req.query.limit === 'number' ? req.query.limit : 20;
    const offset = typeof req.query.offset === 'number' ? req.query.offset : 0;

    const supabase = createSupabaseAdminClient();

    const { data, count } = await invoicesService.listInvoices(supabase, {
      clientId,
      status,
      limit,
      offset,
    });

    // Audit log
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.INVOICE_LIST_VIEWED,
      entity_type: 'invoice',
      metadata: {
        filters: { status },
        result_count: data.length,
        total_count: count,
      },
    });

    return res.json({
      data,
      meta: {
        total: count,
        limit,
        offset,
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/clients/:clientId/invoices/:invoiceId
 * Get a specific invoice (client-scoped)
 */
invoicesRouter.get(
  '/:invoiceId',
  [
    param('clientId').isUUID().withMessage('clientId must be a valid UUID'),
    param('invoiceId').isUUID().withMessage('invoiceId must be a valid UUID'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId, invoiceId } = req.params;
    const supabase = createSupabaseAdminClient();

    const invoice = await invoicesService.getInvoice(supabase, invoiceId, clientId);

    // Audit log
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.INVOICE_VIEWED,
      entity_type: 'invoice',
      entity_id: invoiceId,
      metadata: {
        invoice_no: invoice.invoice_no,
        status: invoice.status,
      },
    });

    return res.json({
      data: invoice,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * POST /api/clients/:clientId/invoices/:invoiceId/proof
 * Submit proof document for an invoice (client-scoped)
 */
invoicesRouter.post(
  '/:invoiceId/proof',
  [
    param('clientId').isUUID().withMessage('clientId must be a valid UUID'),
    param('invoiceId').isUUID().withMessage('invoiceId must be a valid UUID'),
    body('document_id').isUUID().withMessage('document_id must be a valid UUID'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId, invoiceId } = req.params;
    const { document_id } = req.body;
    const supabase = createSupabaseAdminClient();

    const updatedInvoice = await invoicesService.submitProof(supabase, {
      clientId,
      invoiceId,
      documentId: document_id,
    });

    // Audit log
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.INVOICE_PROOF_SUBMITTED,
      entity_type: 'invoice',
      entity_id: invoiceId,
      metadata: {
        invoice_no: updatedInvoice.invoice_no,
        proof_document_id: document_id,
        previous_status: 'OPEN',
        new_status: 'REVIEW',
      },
    });

    return res.json({
      data: updatedInvoice,
      meta: {
        message: 'Proof submitted successfully. Invoice is now under review.',
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * POST /api/clients/:clientId/invoices/:invoiceId/attach-document
 * Attach invoice PDF or proof document (admin only)
 */
invoicesRouter.post(
  '/:invoiceId/attach-document',
  [
    param('clientId').isUUID().withMessage('clientId must be a valid UUID'),
    param('invoiceId').isUUID().withMessage('invoiceId must be a valid UUID'),
    body('document_id').isUUID().withMessage('document_id must be a valid UUID'),
    body('document_type')
      .isIn(['invoice', 'proof'])
      .withMessage('document_type must be invoice or proof'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId, invoiceId } = req.params;
    const { document_id, document_type } = req.body;
    const supabase = createSupabaseAdminClient();

    const updatedInvoice = await invoicesService.attachInvoiceDocument(supabase, {
      clientId,
      invoiceId,
      documentId: document_id,
      documentType: document_type,
    });

    // Audit log
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.INVOICE_UPDATED,
      entity_type: 'invoice',
      entity_id: invoiceId,
      metadata: {
        invoice_no: updatedInvoice.invoice_no,
        document_id,
        document_type,
      },
    });

    return res.json({
      data: updatedInvoice,
      meta: {
        message: `${document_type === 'invoice' ? 'Invoice PDF' : 'Proof document'} attached successfully.`,
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * POST /api/clients/:clientId/invoices/:invoiceId/mark-paid
 * Mark invoice as paid with payment details (admin only)
 */
invoicesRouter.post(
  '/:invoiceId/mark-paid',
  [
    param('clientId').isUUID().withMessage('clientId must be a valid UUID'),
    param('invoiceId').isUUID().withMessage('invoiceId must be a valid UUID'),
    body('paid_at').isISO8601().withMessage('paid_at must be a valid ISO8601 date'),
    body('payment_method')
      .isIn(['bank_transfer', 'credit_card', 'cash', 'other'])
      .withMessage('payment_method must be bank_transfer, credit_card, cash, or other'),
    body('payment_reference').optional().isString().withMessage('payment_reference must be a string'),
    body('payment_note').optional().isString().withMessage('payment_note must be a string'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId, invoiceId } = req.params;
    const { paid_at, payment_method, payment_reference, payment_note } = req.body;
    const supabase = createSupabaseAdminClient();

    const updatedInvoice = await invoicesService.markInvoiceAsPaid(supabase, {
      clientId,
      invoiceId,
      paidAt: paid_at,
      paymentMethod: payment_method,
      paymentReference: payment_reference,
      paymentNote: payment_note,
      reviewedBy: req.user?.sub,
    });

    // Audit log
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.INVOICE_PAID,
      entity_type: 'invoice',
      entity_id: invoiceId,
      metadata: {
        invoice_no: updatedInvoice.invoice_no,
        paid_at,
        payment_method,
        payment_reference,
        amount_total: updatedInvoice.amount_total,
      },
    });

    return res.json({
      data: updatedInvoice,
      meta: {
        message: 'Invoice marked as paid successfully.',
        timestamp: new Date().toISOString(),
      },
    });
  })
);
