import { TenantScope } from '../../utils/tenantScope';
import { AppError } from '../../middleware/errorHandler';
import { ErrorCodes } from '../../constants/errorCodes';

export interface TaxFunctionRow {
  id: string;
  client_id: string;
  order_index: number;
  process_name: string;
  process_description?: string;
  stakeholders?: string[];
  frequency?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface TaxFunctionRowInsert {
  order_index: number;
  process_name: string;
  process_description?: string;
  stakeholders?: string[];
  frequency?: string;
  notes?: string;
}

export async function getAllByClient(
  scope: TenantScope
): Promise<TaxFunctionRow[]> {
  const { data, error } = await scope.supabase
    .from('tax_function_rows')
    .select('*')
    .eq('client_id', scope.clientId)
    .order('order_index', { ascending: true });

  if (error) {
    throw AppError.fromCode(ErrorCodes.TAX_FUNCTION_FETCH_FAILED, 500);
  }

  return data || [];
}

export async function deleteAllByClient(scope: TenantScope): Promise<void> {
  const { error } = await scope.supabase
    .from('tax_function_rows')
    .delete()
    .eq('client_id', scope.clientId);

  if (error) {
    throw AppError.fromCode(ErrorCodes.TAX_FUNCTION_DELETE_FAILED, 500);
  }
}

export async function insertMany(
  scope: TenantScope,
  rows: TaxFunctionRowInsert[]
): Promise<TaxFunctionRow[]> {
  if (!rows || rows.length === 0) {
    return [];
  }

  const insertData = rows.map((row) => ({
    client_id: scope.clientId,
    order_index: row.order_index,
    process_name: row.process_name,
    process_description: row.process_description,
    stakeholders: row.stakeholders,
    frequency: row.frequency,
    notes: row.notes,
  }));

  const { data, error } = await scope.supabase
    .from('tax_function_rows')
    .insert(insertData)
    .select('*');

  if (error) {
    throw AppError.fromCode(ErrorCodes.TAX_FUNCTION_CREATE_FAILED, 500);
  }

  return data || [];
}

export async function insertOne(
  scope: TenantScope,
  row: TaxFunctionRowInsert
): Promise<TaxFunctionRow> {
  const insertData = {
    client_id: scope.clientId,
    order_index: row.order_index,
    process_name: row.process_name,
    process_description: row.process_description,
    stakeholders: row.stakeholders,
    frequency: row.frequency,
    notes: row.notes,
  };

  const { data, error } = await scope.supabase
    .from('tax_function_rows')
    .insert(insertData)
    .select('*')
    .single();

  if (error) {
    throw AppError.fromCode(ErrorCodes.TAX_FUNCTION_CREATE_FAILED, 500);
  }

  return data;
}

export async function updateById(
  scope: TenantScope,
  id: string,
  updates: Partial<TaxFunctionRowInsert>
): Promise<TaxFunctionRow> {
  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.order_index !== undefined) updateData.order_index = updates.order_index;
  if (updates.process_name !== undefined) updateData.process_name = updates.process_name;
  if (updates.process_description !== undefined) updateData.process_description = updates.process_description;
  if (updates.stakeholders !== undefined) updateData.stakeholders = updates.stakeholders;
  if (updates.frequency !== undefined) updateData.frequency = updates.frequency;
  if (updates.notes !== undefined) updateData.notes = updates.notes;

  const { data, error } = await scope.supabase
    .from('tax_function_rows')
    .update(updateData)
    .eq('id', id)
    .eq('client_id', scope.clientId)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw AppError.fromCode(ErrorCodes.TAX_FUNCTION_ROW_NOT_FOUND, 404);
    }
    throw AppError.fromCode(ErrorCodes.TAX_FUNCTION_UPDATE_FAILED, 500);
  }

  if (!data) {
    throw AppError.fromCode(ErrorCodes.TAX_FUNCTION_ROW_NOT_FOUND, 404);
  }

  return data;
}

export async function deleteById(
  scope: TenantScope,
  id: string
): Promise<void> {
  const { data, error } = await scope.supabase
    .from('tax_function_rows')
    .delete()
    .eq('id', id)
    .eq('client_id', scope.clientId)
    .select('id')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw AppError.fromCode(ErrorCodes.TAX_FUNCTION_ROW_NOT_FOUND, 404);
    }
    throw AppError.fromCode(ErrorCodes.TAX_FUNCTION_DELETE_FAILED, 500);
  }

  if (!data) {
    throw AppError.fromCode(ErrorCodes.TAX_FUNCTION_ROW_NOT_FOUND, 404);
  }
}

export interface BulkOrderUpdate {
  id: string;
  order_index: number;
}

export async function bulkUpdateOrder(
  scope: TenantScope,
  updates: BulkOrderUpdate[]
): Promise<void> {
  // Execute updates sequentially for simplicity
  // In a production system, you might want to use a transaction or batch update
  for (const update of updates) {
    const { error } = await scope.supabase
      .from('tax_function_rows')
      .update({
        order_index: update.order_index,
        updated_at: new Date().toISOString(),
      })
      .eq('id', update.id)
      .eq('client_id', scope.clientId);

    if (error) {
      throw AppError.fromCode(ErrorCodes.TAX_FUNCTION_UPDATE_FAILED, 500);
    }
  }
}
