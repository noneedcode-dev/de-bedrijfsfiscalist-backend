import { SupabaseClient } from '@supabase/supabase-js';
import * as taxFunctionRowsRepository from './taxFunctionRows.repository';
import { TAX_FUNCTION_COLUMNS } from './taxFunction.constants';
import { createTenantScope, createAdminBypassScope } from '../../utils/tenantScope';

export interface TaxFunctionResponse {
  data: {
    columns: Array<{ key: string; label: string }>;
    rows: Array<{
      row_index: number;
      cells: any;
    }>;
  };
  meta: {
    updated_at: string | null;
  };
}

export async function getTaxFunction(
  supabase: SupabaseClient,
  clientId: string,
  isAdminBypass: boolean = false
): Promise<TaxFunctionResponse> {
  const scope = isAdminBypass
    ? createAdminBypassScope(supabase, clientId)
    : createTenantScope(supabase, clientId);

  const rows = await taxFunctionRowsRepository.getAllByClient(scope);

  const sortedRows = rows
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    .map((row) => ({
      row_index: row.order_index || 0,
      cells: {
        process: row.process_name,
        description: row.process_description || '',
        responsible_party: row.stakeholders?.join(', ') || '',
        frequency: row.frequency || '',
        deadline: '',
        status: '',
        notes: row.notes || '',
      },
    }));

  const latestUpdatedAt =
    rows.length > 0
      ? rows.reduce((latest, row) => {
          return !latest || new Date(row.updated_at) > new Date(latest)
            ? row.updated_at
            : latest;
        }, rows[0].updated_at)
      : null;

  return {
    data: {
      columns: TAX_FUNCTION_COLUMNS.map((col) => ({
        key: col.key,
        label: col.label,
      })),
      rows: sortedRows,
    },
    meta: {
      updated_at: latestUpdatedAt,
    },
  };
}

export interface ImportRowInput {
  row_index: number;
  cells: any;
}

export interface ImportError {
  row_index: number;
  reason: string;
}

export interface ImportResponse {
  data: {
    inserted: number;
    updated: number;
    deleted: number;
    errors: ImportError[];
  };
}

function validateImportRow(row: any): { valid: boolean; reason?: string } {
  if (typeof row.row_index !== 'number') {
    return { valid: false, reason: 'row_index must be a number' };
  }
  if (typeof row.cells !== 'object' || row.cells === null || Array.isArray(row.cells)) {
    return { valid: false, reason: 'cells must be an object' };
  }
  return { valid: true };
}

function mapCellsToRowInsert(rowIndex: number, cells: any): taxFunctionRowsRepository.TaxFunctionRowInsert {
  return {
    order_index: rowIndex,
    process_name: cells.process || '',
    process_description: cells.description || undefined,
    stakeholders: cells.responsible_party ? cells.responsible_party.split(',').map((s: string) => s.trim()) : undefined,
    frequency: cells.frequency || undefined,
    notes: cells.notes || undefined,
  };
}

export async function importTaxFunction(
  supabase: SupabaseClient,
  clientId: string,
  rows: ImportRowInput[],
  isAdminBypass: boolean = false
): Promise<ImportResponse> {
  const scope = isAdminBypass
    ? createAdminBypassScope(supabase, clientId)
    : createTenantScope(supabase, clientId);

  const errors: ImportError[] = [];
  const validRows: taxFunctionRowsRepository.TaxFunctionRowInsert[] = [];

  for (const row of rows) {
    const validation = validateImportRow(row);
    if (!validation.valid) {
      errors.push({
        row_index: typeof row.row_index === 'number' ? row.row_index : -1,
        reason: validation.reason!,
      });
      continue;
    }

    validRows.push(mapCellsToRowInsert(row.row_index, row.cells));
  }

  const existingRows = await taxFunctionRowsRepository.getAllByClient(scope);
  const deletedCount = existingRows.length;

  await taxFunctionRowsRepository.deleteAllByClient(scope);

  let insertedCount = 0;
  if (validRows.length > 0) {
    const inserted = await taxFunctionRowsRepository.insertMany(scope, validRows);
    insertedCount = inserted.length;
  }

  return {
    data: {
      inserted: insertedCount,
      updated: 0,
      deleted: deletedCount,
      errors,
    },
  };
}

export interface CreateRowInput {
  order_index: number;
  process_name: string;
  process_description?: string;
  stakeholders?: string[];
  frequency?: string;
  notes?: string;
}

export interface UpdateRowInput {
  order_index?: number;
  process_name?: string;
  process_description?: string;
  stakeholders?: string[];
  frequency?: string;
  notes?: string;
}

export interface ReorderUpdate {
  id: string;
  order_index: number;
}

export async function createRow(
  supabase: SupabaseClient,
  clientId: string,
  payload: CreateRowInput,
  isAdminBypass: boolean = false
): Promise<taxFunctionRowsRepository.TaxFunctionRow> {
  const scope = isAdminBypass
    ? createAdminBypassScope(supabase, clientId)
    : createTenantScope(supabase, clientId);

  const rowData: taxFunctionRowsRepository.TaxFunctionRowInsert = {
    order_index: payload.order_index,
    process_name: payload.process_name,
    process_description: payload.process_description,
    stakeholders: payload.stakeholders,
    frequency: payload.frequency,
    notes: payload.notes,
  };

  return await taxFunctionRowsRepository.insertOne(scope, rowData);
}

export async function updateRow(
  supabase: SupabaseClient,
  clientId: string,
  id: string,
  patch: UpdateRowInput,
  isAdminBypass: boolean = false
): Promise<taxFunctionRowsRepository.TaxFunctionRow> {
  const scope = isAdminBypass
    ? createAdminBypassScope(supabase, clientId)
    : createTenantScope(supabase, clientId);

  return await taxFunctionRowsRepository.updateById(scope, id, patch);
}

export async function deleteRow(
  supabase: SupabaseClient,
  clientId: string,
  id: string,
  isAdminBypass: boolean = false
): Promise<void> {
  const scope = isAdminBypass
    ? createAdminBypassScope(supabase, clientId)
    : createTenantScope(supabase, clientId);

  await taxFunctionRowsRepository.deleteById(scope, id);
}

export async function reorderRows(
  supabase: SupabaseClient,
  clientId: string,
  updates: ReorderUpdate[],
  isAdminBypass: boolean = false
): Promise<void> {
  const scope = isAdminBypass
    ? createAdminBypassScope(supabase, clientId)
    : createTenantScope(supabase, clientId);

  const bulkUpdates: taxFunctionRowsRepository.BulkOrderUpdate[] = updates.map((u) => ({
    id: u.id,
    order_index: u.order_index,
  }));

  await taxFunctionRowsRepository.bulkUpdateOrder(scope, bulkUpdates);
}
