export interface Topic {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface Dimension {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface MatrixCell {
  id: string;
  topic_id: string;
  dimension_id: string;
  likelihood: number;
  impact: number;
  score: number;
  color: 'green' | 'orange' | 'red';
  status: 'open' | 'in_progress' | 'closed';
  notes: string | null;
  owner_user_id: string | null;
  last_reviewed_at: string | null;
  updated_at: string;
}

export interface MatrixGridResponse {
  topics: Topic[];
  dimensions: Dimension[];
  cells: MatrixCell[];
}

export interface InitializeResponse {
  topics_created: number;
  dimensions_created: number;
  cells_created: number;
  total_topics: number;
  total_dimensions: number;
  total_cells: number;
}

export const DEFAULT_DIMENSIONS = [
  'Compliance',
  'Reporting',
  'Documentation',
  'Process',
  'IT/Systems'
];

export const DEFAULT_TOPICS = [
  'VAT',
  'Corporate Income Tax',
  'Payroll Tax',
  'Transfer Pricing',
  'Withholding Tax',
  'Financial Reporting',
  'International VAT/OSS/IOSS',
  'Other'
];
