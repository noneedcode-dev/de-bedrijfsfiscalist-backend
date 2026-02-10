import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/errorHandler';
import { ErrorCodes } from '../../constants/errorCodes';
import { DbInvoice, InvoiceStatus } from '../../types/database';

export interface CreateInvoiceParams {
  clientId: string;
  title: string;
  description?: string;
  currency?: string;
  amountTotal: string; // decimal as string
  dueDate: string; // date
  periodStart?: string; // date
  periodEnd?: string; // date
  autoCalculate?: boolean;
  createdBy?: string;
}

export interface ListInvoicesParams {
  clientId?: string;
  status?: InvoiceStatus;
  fromDate?: string;
  toDate?: string;
  limit: number;
  offset: number;
}

export interface SubmitProofParams {
  clientId: string;
  invoiceId: string;
  documentId: string;
}

export interface ReviewInvoiceParams {
  invoiceId: string;
  decision: 'approve' | 'cancel';
  reviewNote?: string;
  reviewedBy?: string;
}

export interface MarkInvoicePaidParams {
  invoiceId: string;
  clientId: string;
  paidAt: string;
  paymentMethod: 'bank_transfer' | 'credit_card' | 'cash' | 'other';
  paymentReference?: string;
  paymentNote?: string;
  reviewedBy?: string;
}

export interface AttachInvoiceDocumentParams {
  invoiceId: string;
  clientId: string;
  documentId: string;
  documentType: 'invoice' | 'proof';
}

export async function createInvoice(
  supabase: SupabaseClient,
  params: CreateInvoiceParams
): Promise<DbInvoice> {
  const {
    clientId,
    title,
    description,
    currency = 'EUR',
    amountTotal,
    dueDate,
    periodStart,
    periodEnd,
    autoCalculate,
    createdBy,
  } = params;

  // Validate amount
  const amount = parseFloat(amountTotal);
  if (isNaN(amount) || amount <= 0) {
    throw new AppError(
      'Invoice amount must be a positive number',
      422,
      ErrorCodes.VALIDATION_FAILED
    );
  }

  // Generate invoice number
  const { data: invoiceNo, error: invoiceNoError } = await supabase.rpc(
    'generate_invoice_number',
    { p_client_id: clientId }
  );

  if (invoiceNoError || !invoiceNo) {
    throw new AppError(
      `Failed to generate invoice number: ${invoiceNoError?.message}`,
      500,
      ErrorCodes.INVOICE_NUMBER_GENERATION_FAILED
    );
  }

  // Auto-calculate billable minutes and hourly rate if requested
  let billableMinutesSnapshot: number | null = null;
  let hourlyRateSnapshot: string | null = null;

  if (autoCalculate && periodStart && periodEnd) {
    // Sum billable minutes from time_entries
    const { data: entries, error: entriesError } = await supabase
      .from('time_entries')
      .select('billable_minutes')
      .eq('client_id', clientId)
      .gte('worked_at', periodStart)
      .lte('worked_at', periodEnd)
      .is('deleted_at', null);

    if (entriesError) {
      throw new AppError(
        `Failed to calculate billable minutes: ${entriesError.message}`,
        500,
        ErrorCodes.INTERNAL_ERROR
      );
    }

    billableMinutesSnapshot = (entries || []).reduce(
      (sum, entry) => sum + entry.billable_minutes,
      0
    );

    // Get current plan's hourly rate
    const { data: currentPlan } = await supabase
      .from('client_plans')
      .select('plan_code')
      .eq('client_id', clientId)
      .lte('effective_from', periodEnd)
      .or(`effective_to.is.null,effective_to.gte.${periodEnd}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (currentPlan) {
      const { data: planConfig } = await supabase
        .from('plan_configs')
        .select('hourly_rate_eur')
        .eq('plan_code', currentPlan.plan_code)
        .single();

      if (planConfig) {
        hourlyRateSnapshot = planConfig.hourly_rate_eur;
      }
    }
  }

  // Insert invoice
  const { data: invoice, error: insertError } = await supabase
    .from('invoices')
    .insert({
      client_id: clientId,
      invoice_no: invoiceNo,
      title,
      description: description || null,
      currency,
      amount_total: amountTotal,
      status: 'OPEN',
      due_date: dueDate,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      billable_minutes_snapshot: billableMinutesSnapshot,
      hourly_rate_snapshot: hourlyRateSnapshot,
      created_by: createdBy || null,
    })
    .select()
    .single();

  if (insertError) {
    throw new AppError(
      `Failed to create invoice: ${insertError.message}`,
      500,
      ErrorCodes.INVOICE_CREATE_FAILED
    );
  }

  return invoice as DbInvoice;
}

export async function listInvoices(
  supabase: SupabaseClient,
  params: ListInvoicesParams
): Promise<{ data: DbInvoice[]; count: number }> {
  let query = supabase
    .from('invoices')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (params.clientId) {
    query = query.eq('client_id', params.clientId);
  }

  if (params.status) {
    query = query.eq('status', params.status);
  }

  if (params.fromDate) {
    query = query.gte('created_at', params.fromDate);
  }

  if (params.toDate) {
    query = query.lte('created_at', params.toDate);
  }

  const { data, error, count } = await query.range(
    params.offset,
    params.offset + params.limit - 1
  );

  if (error) {
    throw new AppError(
      `Failed to fetch invoices: ${error.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  return { data: (data || []) as DbInvoice[], count: count || 0 };
}

export async function getInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  clientId?: string
): Promise<DbInvoice> {
  let query = supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId);

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data, error } = await query.single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new AppError('Invoice not found', 404, ErrorCodes.INVOICE_NOT_FOUND);
    }
    throw new AppError(
      `Failed to fetch invoice: ${error.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  return data as DbInvoice;
}

export async function submitProof(
  supabase: SupabaseClient,
  params: SubmitProofParams
): Promise<DbInvoice> {
  const { clientId, invoiceId, documentId } = params;

  // Fetch invoice
  const invoice = await getInvoice(supabase, invoiceId, clientId);

  if (invoice.status !== 'OPEN') {
    throw new AppError(
      'Can only submit proof for invoices with OPEN status',
      400,
      ErrorCodes.INVOICE_INVALID_STATUS
    );
  }

  // Verify document exists and belongs to client
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id')
    .eq('id', documentId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .single();

  if (docError || !document) {
    throw new AppError(
      'Document not found or does not belong to this client',
      404,
      ErrorCodes.DOCUMENT_NOT_FOUND
    );
  }

  // Atomic update with concurrency guard
  const { data: updatedInvoice, error: updateError } = await supabase
    .from('invoices')
    .update({
      proof_document_id: documentId,
      status: 'REVIEW',
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .eq('status', 'OPEN') // Concurrency guard
    .select()
    .single();

  if (updateError || !updatedInvoice) {
    throw new AppError(
      'Invoice already reviewed or status changed',
      409,
      ErrorCodes.INVOICE_ALREADY_REVIEWED
    );
  }

  return updatedInvoice as DbInvoice;
}

export async function reviewInvoice(
  supabase: SupabaseClient,
  params: ReviewInvoiceParams
): Promise<DbInvoice> {
  const { invoiceId, decision, reviewNote, reviewedBy } = params;

  // Fetch invoice
  const invoice = await getInvoice(supabase, invoiceId);

  if (invoice.status !== 'REVIEW') {
    throw new AppError(
      'Can only review invoices with REVIEW status',
      400,
      ErrorCodes.INVOICE_INVALID_STATUS
    );
  }

  const newStatus: InvoiceStatus = decision === 'approve' ? 'PAID' : 'CANCELLED';

  const { data: updatedInvoice, error: updateError } = await supabase
    .from('invoices')
    .update({
      status: newStatus,
      reviewed_by: reviewedBy || null,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .select()
    .single();

  if (updateError) {
    throw new AppError(
      `Failed to review invoice: ${updateError.message}`,
      500,
      ErrorCodes.INVOICE_UPDATE_FAILED
    );
  }

  return updatedInvoice as DbInvoice;
}

export async function markInvoiceAsPaid(
  supabase: SupabaseClient,
  params: MarkInvoicePaidParams
): Promise<DbInvoice> {
  const {
    invoiceId,
    clientId,
    paidAt,
    paymentMethod,
    paymentReference,
    paymentNote,
    reviewedBy,
  } = params;

  // Fetch invoice
  const invoice = await getInvoice(supabase, invoiceId, clientId);

  if (invoice.status === 'PAID') {
    throw new AppError(
      'Invoice is already marked as paid',
      400,
      ErrorCodes.INVOICE_INVALID_STATUS
    );
  }

  if (invoice.status === 'CANCELLED') {
    throw new AppError(
      'Cannot mark cancelled invoice as paid',
      400,
      ErrorCodes.INVOICE_INVALID_STATUS
    );
  }

  const { data: updatedInvoice, error: updateError } = await supabase
    .from('invoices')
    .update({
      status: 'PAID',
      paid_at: paidAt,
      payment_method: paymentMethod,
      payment_reference: paymentReference || null,
      payment_note: paymentNote || null,
      reviewed_by: reviewedBy || null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .eq('client_id', clientId)
    .select()
    .single();

  if (updateError) {
    throw new AppError(
      `Failed to mark invoice as paid: ${updateError.message}`,
      500,
      ErrorCodes.INVOICE_UPDATE_FAILED
    );
  }

  return updatedInvoice as DbInvoice;
}

export async function attachInvoiceDocument(
  supabase: SupabaseClient,
  params: AttachInvoiceDocumentParams
): Promise<DbInvoice> {
  const { invoiceId, clientId, documentId, documentType } = params;

  // Verify document exists and belongs to client
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id')
    .eq('id', documentId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .single();

  if (docError || !document) {
    throw new AppError(
      'Document not found or does not belong to this client',
      404,
      ErrorCodes.DOCUMENT_NOT_FOUND
    );
  }

  // Update invoice with document reference
  const updateField =
    documentType === 'invoice' ? 'invoice_document_id' : 'proof_document_id';

  const { data: updatedInvoice, error: updateError } = await supabase
    .from('invoices')
    .update({
      [updateField]: documentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .eq('client_id', clientId)
    .select()
    .single();

  if (updateError) {
    throw new AppError(
      `Failed to attach document to invoice: ${updateError.message}`,
      500,
      ErrorCodes.INVOICE_UPDATE_FAILED
    );
  }

  return updatedInvoice as DbInvoice;
}
