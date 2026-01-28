export interface TaxFunctionColumn {
  key: string;
  label: string;
}

export const TAX_FUNCTION_COLUMNS: readonly TaxFunctionColumn[] = [
  { key: 'process', label: 'Process' },
  { key: 'r', label: 'R' },
  { key: 'a', label: 'A' },
  { key: 'c', label: 'C' },
  { key: 'i', label: 'I' },
  { key: 'notes', label: 'Notes' },
] as const;

export const TAX_FUNCTION_COLUMN_KEYS = TAX_FUNCTION_COLUMNS.map((col) => col.key);

export type TaxFunctionColumnKey = typeof TAX_FUNCTION_COLUMNS[number]['key'];
