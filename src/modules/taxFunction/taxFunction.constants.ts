export interface TaxFunctionColumn {
  key: string;
  label: string;
}

export const TAX_FUNCTION_COLUMNS: readonly TaxFunctionColumn[] = [
  { key: 'process', label: 'Process' },
  { key: 'description', label: 'Description' },
  { key: 'responsible_party', label: 'Responsible Party' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'deadline', label: 'Deadline' },
  { key: 'status', label: 'Status' },
  { key: 'notes', label: 'Notes' },
] as const;

export const TAX_FUNCTION_COLUMN_KEYS = TAX_FUNCTION_COLUMNS.map((col) => col.key);

export type TaxFunctionColumnKey = typeof TAX_FUNCTION_COLUMNS[number]['key'];
