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
